import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const accountRepository = {
  listByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.findMany({
      where: { ledgerId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  },

  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.findUnique({ where: { id } });
  },

  /**
   * Walks the parent chain from `startId` and returns every ancestor id (one
   * round-trip via a recursive CTE). Empty result when the start id is missing.
   * Cycle-safe: a previously-seen id stops the walk via a path array.
   */
  async findAncestorIds(
    startId: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        SELECT "id", "parentId", ARRAY["id"] AS path
        FROM "qianlai_book_account"
        WHERE "id" = ${startId}
        UNION ALL
        SELECT ba."id", ba."parentId", a.path || ba."id"
        FROM "qianlai_book_account" ba
        INNER JOIN ancestors a ON ba."id" = a."parentId"
        WHERE NOT (ba."id" = ANY(a.path))
      )
      SELECT "id" FROM ancestors
    `;
    return rows.map((r) => r.id);
  },

  createStarterAccounts(
    ledgerId: string,
    accounts: Array<{
      name: string;
      type: string;
      sortOrder: number;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
    }>,
    tx: Prisma.TransactionClient = prisma,
  ) {
    if (accounts.length === 0) return Promise.resolve({ count: 0 });
    return tx.bookAccount.createMany({
      data: accounts.map((a) => ({
        ...a,
        ledgerId,
        meta:
          a.meta === undefined || a.meta === null
            ? undefined
            : (a.meta as Prisma.InputJsonValue),
      })),
    });
  },

  create(
    data: {
      ledgerId: string;
      name: string;
      type: string;
      sortOrder?: number;
      parentId?: string | null;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.create({
      data: {
        ...data,
        meta:
          data.meta === undefined || data.meta === null
            ? undefined
            : (data.meta as Prisma.InputJsonValue),
      },
    });
  },

  update(
    id: string,
    data: {
      name?: string;
      parentId?: string | null;
      sortOrder?: number;
      status?: string;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.update({
      where: { id },
      data: {
        ...data,
        meta:
          data.meta === undefined
            ? undefined
            : data.meta === null
              ? Prisma.DbNull
              : (data.meta as Prisma.InputJsonValue),
      },
    });
  },

  delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.delete({ where: { id } });
  },

  countLines(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalLine.count({ where: { accountId: id } });
  },

  countChildren(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.count({ where: { parentId: id } });
  },

  countActiveChildren(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.count({
      where: { parentId: id, status: "active" },
    });
  },
};
