import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const preferenceRepository = {
  listForUser(userId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.qianlaiUserPreference.findMany({
      where: { userId },
      orderBy: [{ scopeType: "asc" }, { scopeId: "asc" }],
    });
  },

  upsert(
    userId: string,
    scopeType: string,
    scopeId: string,
    data: Prisma.InputJsonValue,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.qianlaiUserPreference.upsert({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
      create: { userId, scopeType, scopeId, data },
      update: { data },
    });
  },

  /**
   * Idempotent removal (deleteMany, not delete): an absent row already IS
   * "back to defaults", so no 404 — and the userId in the where clause makes
   * this a strictly own-data operation.
   */
  remove(
    userId: string,
    scopeType: string,
    scopeId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.qianlaiUserPreference.deleteMany({
      where: { userId, scopeType, scopeId },
    });
  },
};
