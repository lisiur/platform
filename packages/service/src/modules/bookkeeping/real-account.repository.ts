import { Prisma, type RealAccount } from "#generated/prisma/client";
import { prisma } from "#lib/db";

/**
 * Pockets are restricted to ledgers the owner is currently a member of:
 * leaving a shared ledger detaches its pockets from the owner's overview
 * (the link itself survives, so rejoining restores the roll-up).
 */
const ownerPocketWhere = (ownerId: string) => ({
  ledger: { members: { some: { userId: ownerId } } },
});

export const realAccountRepository = {
  /** Owner overview: real accounts with their membership-visible pockets. */
  listWithPockets(ownerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.realAccount.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        pockets: {
          where: ownerPocketWhere(ownerId),
          include: {
            ledger: { select: { id: true, name: true, status: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
    });
  },

  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.realAccount.findUnique({ where: { id } });
  },

  /**
   * SELECT ... FOR UPDATE on the master row. Linking (account.service) and
   * deletion both hold this lock while validating, so neither can slip past
   * the other's checks — without it a concurrent link would land after the
   * delete guard's pocket count and silently detach via the SetNull fallback.
   */
  async lockById(id: string, tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<RealAccount[]>`
      SELECT * FROM "qianlai_real_account" WHERE "id" = ${id} FOR UPDATE
    `;
    return row ?? null;
  },

  /**
   * Debit/credit sums per pocket account. Ownership- and membership-scoped
   * in the query itself, so the aggregate cannot include pockets of ledgers
   * the owner cannot see — the privacy boundary is structural.
   */
  sumLinesByOwnerPockets(
    ownerId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalLine.groupBy({
      by: ["accountId"],
      where: {
        account: {
          realAccount: { ownerId },
          ...ownerPocketWhere(ownerId),
        },
      },
      _sum: { debit: true, credit: true },
    });
  },

  create(
    data: {
      ownerId: string;
      name: string;
      type: string;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.realAccount.create({
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
      status?: string;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.realAccount.update({
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
    return tx.realAccount.delete({ where: { id } });
  },

  /**
   * Linked pockets across ALL ledgers (not membership-filtered): the delete
   * guard needs the true FK reference count so no pocket is silently
   * detached by the SetNull fallback.
   */
  countPockets(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.count({ where: { realAccountId: id } });
  },
};
