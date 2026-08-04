import { prisma } from "#lib/db";
import type { JobHandler } from "#lib/queues/job.types";

export const verificationSweepHandler: JobHandler = async () => {
  const result = await prisma.verification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return { deleted: result.count };
};
