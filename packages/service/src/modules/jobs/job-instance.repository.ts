import type { JobInstance, Prisma } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export class JobInstanceRepository {
  async create(
    data: {
      jobId?: string;
      type: string;
      description?: string | null;
      payload: unknown;
      priority?: string;
      scheduledAt?: Date;
      maxAttempts?: number;
      timeoutMs?: number;
    },
    tx: Prisma.TransactionClient = prisma,
  ): Promise<JobInstance> {
    return tx.jobInstance.create({
      data: {
        jobId: data.jobId,
        type: data.type,
        description: data.description ?? undefined,
        payload: data.payload as Prisma.InputJsonValue,
        priority: (data.priority as JobInstance["priority"]) ?? "NORMAL",
        scheduledAt: data.scheduledAt ?? new Date(),
        maxAttempts: data.maxAttempts ?? 3,
        timeoutMs: data.timeoutMs ?? 60000,
      },
    });
  }

  async findById(id: string): Promise<JobInstance | null> {
    return prisma.jobInstance.findUnique({ where: { id } });
  }

  /**
   * Atomically claim due PENDING instances and flip them to PROCESSING,
   * returning the claimed rows for enqueue. Uses `SELECT ... FOR UPDATE
   * SKIP LOCKED` to lock rows at read time, so concurrent callers (within
   * or across processes) each get a disjoint set — no double-claim under
   * READ COMMITTED. Mirrors `claimDueTemplates` in job.repository.ts.
   * `attempts` is left untouched; the worker owns the `attempts + 1` increment.
   *
   * Because the status flip happens before the in-memory queue drains, a
   * process death (OOM, deploy, SIGKILL) between claim and worker pickup
   * orphans the row. `recoverStuckProcessing` at next boot resets it.
   */
  async claimDueJobs(now: Date, limit: number): Promise<JobInstance[]> {
    return prisma.$transaction(async (t) => {
      const rows = await t.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "job_instance"
        WHERE "status" = 'PENDING'
          AND "scheduledAt" <= ${now}
        ORDER BY "scheduledAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);

      await t.jobInstance.updateMany({
        where: { id: { in: ids }, status: JobStatus.PENDING },
        data: { status: JobStatus.PROCESSING },
      });

      return t.jobInstance.findMany({ where: { id: { in: ids } } });
    });
  }

  /**
   * Claim a single due instance by id. Used by `onJobCreated` to route a
   * freshly-created job through the same atomic claim path as `claimDueJobs`,
   * so concurrent `loadExpiredJobs` and `job:created` paths cannot double-enqueue.
   * Returns `null` if the row was already claimed by another path.
   */
  async claimJobById(id: string, now: Date): Promise<JobInstance | null> {
    const result = await prisma.jobInstance.updateMany({
      where: { id, status: JobStatus.PENDING, scheduledAt: { lte: now } },
      data: { status: JobStatus.PROCESSING },
    });
    if (result.count === 0) return null;
    return prisma.jobInstance.findUnique({ where: { id } });
  }

  /**
   * Reset every PROCESSING instance back to PENDING. Called once at boot,
   * before `loadExpiredJobs`. Under the single-process deployment constraint,
   * any row still PROCESSING at startup was orphaned by a previous process
   * death — either claimed by `claimDueJobs` but not yet picked up by the
   * worker, or actively executing when the process was killed. After reset,
   * `loadExpiredJobs` re-claims and re-enqueues them. `startedAt` is cleared
   * so the worker sets it fresh when it actually begins processing.
   */
  async recoverStuckProcessing(): Promise<number> {
    const result = await prisma.jobInstance.updateMany({
      where: { status: JobStatus.PROCESSING },
      data: { status: JobStatus.PENDING, startedAt: null },
    });
    return result.count;
  }

  async findNextScheduledJob(): Promise<JobInstance | null> {
    return prisma.jobInstance.findFirst({
      where: { status: JobStatus.PENDING },
      orderBy: { scheduledAt: "asc" },
    });
  }

  async countExpiredJobs(): Promise<number> {
    return prisma.jobInstance.count({
      where: {
        status: JobStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
    });
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    data?: {
      startedAt?: Date;
      completedAt?: Date;
      result?: unknown;
      error?: string;
      attempts?: number;
      scheduledAt?: Date;
    },
  ): Promise<JobInstance> {
    return prisma.jobInstance.update({
      where: { id },
      data: {
        status,
        startedAt: data?.startedAt,
        completedAt: data?.completedAt,
        result: data?.result as Prisma.InputJsonValue | undefined,
        error: data?.error,
        attempts: data?.attempts,
        scheduledAt: data?.scheduledAt,
      },
    });
  }

  async countByStatus(): Promise<Record<JobStatus, number>> {
    const groups = await prisma.jobInstance.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts: Record<JobStatus, number> = {
      [JobStatus.PENDING]: 0,
      [JobStatus.PROCESSING]: 0,
      [JobStatus.COMPLETED]: 0,
      [JobStatus.FAILED]: 0,
    } as Record<JobStatus, number>;
    for (const g of groups) {
      counts[g.status] = g._count._all;
    }
    return counts;
  }

  async findByFilter(filter: {
    status?: JobStatus;
    type?: string;
    jobId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: JobInstance[]; total: number }> {
    const where: Prisma.JobInstanceWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;
    if (filter.jobId) where.jobId = filter.jobId;

    const [jobs, total] = await Promise.all([
      prisma.jobInstance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 20,
        skip: filter.offset ?? 0,
      }),
      prisma.jobInstance.count({ where }),
    ]);

    return { jobs, total };
  }

  async delete(id: string): Promise<void> {
    await prisma.jobInstance.delete({ where: { id } });
  }

  /**
   * Delete terminal (COMPLETED/FAILED) instances whose `completedAt` is older
   * than `olderThan`, bounding the growth of the `job_instance` table for
   * recurring jobs. Backed by the `@@index([completedAt])`.
   */
  async deleteManyTerminal(olderThan: Date): Promise<number> {
    const result = await prisma.jobInstance.deleteMany({
      where: {
        status: { in: [JobStatus.COMPLETED, JobStatus.FAILED] },
        completedAt: { lt: olderThan },
      },
    });
    return result.count;
  }
}

export const jobInstanceRepository = new JobInstanceRepository();
