import type { Job, JobArchive, Prisma } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export class JobRepository {
  async create(data: {
    type: string;
    payload: unknown;
    priority?: string;
    scheduledAt?: Date;
    maxAttempts?: number;
    timeoutMs?: number;
  }): Promise<Job> {
    return prisma.job.create({
      data: {
        type: data.type,
        payload: data.payload as Prisma.InputJsonValue,
        priority: (data.priority as Job["priority"]) ?? "NORMAL",
        scheduledAt: data.scheduledAt ?? new Date(),
        maxAttempts: data.maxAttempts ?? 3,
        timeoutMs: data.timeoutMs ?? 60000,
      },
    });
  }

  async findById(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id } });
  }

  async findPendingJobs(opts: { limit: number }): Promise<Job[]> {
    return prisma.job.findMany({
      where: { status: JobStatus.PENDING },
      orderBy: { scheduledAt: "asc" },
      take: opts.limit,
    });
  }

  async findNextScheduledJob(): Promise<Job | null> {
    return prisma.job.findFirst({
      where: { status: JobStatus.PENDING },
      orderBy: { scheduledAt: "asc" },
    });
  }

  async countExpiredJobs(): Promise<number> {
    return prisma.job.count({
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
  ): Promise<Job> {
    return prisma.job.update({
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
    const groups = await prisma.job.groupBy({
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
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: Job[]; total: number }> {
    const where: Prisma.JobWhereInput = {};
    if (filter.status) where.status = filter.status;
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

  async delete(id: string): Promise<void> {
    await prisma.job.delete({ where: { id } });
  }

  async archiveAndDelete(job: Job): Promise<void> {
    await prisma.jobArchive.create({
      data: {
        type: job.type,
        payload: job.payload as Prisma.InputJsonValue,
        status: job.status,
        priority: job.priority,
        result: job.result as Prisma.InputJsonValue | undefined,
        error: job.error,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        timeoutMs: job.timeoutMs,
        scheduledAt: job.scheduledAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        originalJobId: job.id,
      },
    });
    await prisma.job.delete({ where: { id: job.id } });
  }

  async findArchivedById(id: string): Promise<JobArchive | null> {
    return prisma.jobArchive.findUnique({ where: { id } });
  }

  async findArchivedByFilter(filter: {
    status?: JobStatus;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobArchives: JobArchive[]; total: number }> {
    const where: Prisma.JobArchiveWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;

    const [jobArchives, total] = await Promise.all([
      prisma.jobArchive.findMany({
        where,
        orderBy: { completedAt: "desc" },
        take: filter.limit ?? 20,
        skip: filter.offset ?? 0,
      }),
      prisma.jobArchive.count({ where }),
    ]);

    return { jobArchives, total };
  }
}

export const jobRepository = new JobRepository();
