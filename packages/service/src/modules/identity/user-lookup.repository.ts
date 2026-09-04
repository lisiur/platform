import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

/**
 * Minimal public shapes for arbitrary users, used by other modules to label
 * historical references whose membership rows are already gone (e.g. a
 * departed ledger/project member still named by a settlement row) but whose
 * account still exists.
 */
export const userLookupRepository = {
  findManyPublicByIds(
    ids: string[],
    tx: Prisma.TransactionClient = prisma,
  ): Promise<Array<{ id: string; name: string; avatar: string | null }>> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, avatar: true },
    });
  },

  findFlagsById(
    id: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<{ flags: string[] } | null> {
    return tx.user.findUnique({ where: { id }, select: { flags: true } });
  },

  renameById(id: string, name: string, tx: Prisma.TransactionClient = prisma) {
    return tx.user.update({ where: { id }, data: { name } });
  },

  deleteById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.user.delete({ where: { id } });
  },
};
