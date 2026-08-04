import { prisma } from "#lib/db";
import type { JobHandler } from "#lib/queues/job.types";

export const sessionSweepHandler: JobHandler = async () => {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });

  return { deleted: result.count };
};
