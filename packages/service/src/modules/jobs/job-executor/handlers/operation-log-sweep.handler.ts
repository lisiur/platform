import { prisma } from "#lib/db";
import type { JobHandler } from "#lib/queues/job.types";

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5000;

export const operationLogSweepHandler: JobHandler = async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
  let deleted = 0;

  while (true) {
    const rows = await prisma.operationLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;

    const result = await prisma.operationLog.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    deleted += result.count;
  }

  return { deleted, retentionDays: RETENTION_DAYS };
};
