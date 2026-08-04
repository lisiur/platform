import type { Job, JobPriority, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export class JobRepository {
  async create(
    data: {
      name: string;
      type: string;
      description?: string | null;
      payload?: unknown;
      cronExpression?: string | null;
      enabled?: boolean;
      priority?: JobPriority;
      maxAttempts?: number;
      timeoutMs?: number;
      nextRunAt?: Date | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ): Promise<Job> {
    return tx.job.create({
      data: {
        name: data.name,
        type: data.type,
        description: data.description ?? undefined,
        payload: data.payload as Prisma.InputJsonValue | undefined,
        cronExpression: data.cronExpression ?? undefined,
        enabled: data.enabled ?? true,
        priority: data.priority ?? "NORMAL",
        maxAttempts: data.maxAttempts ?? 3,
        timeoutMs: data.timeoutMs ?? 60000,
        nextRunAt: data.nextRunAt,
      },
    });
  }

  async findById(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { name } });
  }

  async findMany(filter: {
    enabled?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: Job[]; total: number }> {
    const where: Prisma.JobWhereInput = {};
    if (filter.enabled !== undefined) where.enabled = filter.enabled;
    if (filter.type) where.type = filter.type;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 20,
        skip: filter.offset ?? 0,
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }

  async findDueTemplates(now: Date = new Date()): Promise<Job[]> {
    return prisma.job.findMany({
      where: {
        enabled: true,
        cronExpression: { not: null },
        nextRunAt: { lte: now },
      },
      take: 100,
    });
  }

  /**
   * Atomically claim due job templates and advance their schedule, so that
   * concurrent workers cannot produce duplicate instances.
   *
   * Uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction: locked rows
   * are re-fetched, their `lastRunAt`/`nextRunAt` are advanced via
   * `computeNext`, and the claimed templates are returned so the caller can
   * create instances for them. The schedule is advanced within the claim so a
   * transient error during instance creation cannot cause re-dispatch storms.
   */
  async claimDueTemplates(
    now: Date,
    computeNext: (cronExpression: string) => Date,
  ): Promise<Job[]> {
    return prisma.$transaction(async (t) => {
      const rows = await t.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "job"
        WHERE "enabled" = true
          AND "cronExpression" IS NOT NULL
          AND "nextRunAt" <= ${now}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];

      const claimed = await t.job.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });

      for (const tpl of claimed) {
        if (!tpl.cronExpression) continue;
        await t.job.update({
          where: { id: tpl.id },
          data: { lastRunAt: now, nextRunAt: computeNext(tpl.cronExpression) },
        });
      }

      return claimed;
    });
  }

  async findNextDueTemplate(now: Date = new Date()): Promise<Job | null> {
    return prisma.job.findFirst({
      where: {
        enabled: true,
        cronExpression: { not: null },
        nextRunAt: { gt: now },
      },
      orderBy: { nextRunAt: "asc" },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      type?: string;
      description?: string;
      payload?: unknown;
      cronExpression?: string | null;
      enabled?: boolean;
      priority?: JobPriority;
      maxAttempts?: number;
      timeoutMs?: number;
      nextRunAt?: Date | null;
    },
  ): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        description: data.description,
        payload: data.payload as Prisma.InputJsonValue | undefined,
        cronExpression: data.cronExpression,
        enabled: data.enabled,
        priority: data.priority,
        maxAttempts: data.maxAttempts,
        timeoutMs: data.timeoutMs,
        nextRunAt: data.nextRunAt,
      },
    });
  }

  async updateSchedule(
    id: string,
    data: { lastRunAt?: Date; nextRunAt?: Date | null },
  ): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        lastRunAt: data.lastRunAt,
        nextRunAt: data.nextRunAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.job.delete({ where: { id } });
  }
}

export const jobRepository = new JobRepository();
