import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

/** Locks the ledger row (FOR UPDATE) so per-ledger entryNo sequencing is race-free. */
export async function lockLedgerRow(
  t: Prisma.TransactionClient,
  ledgerId: string,
): Promise<void> {
  await t.$queryRaw`SELECT 1 FROM "qianlai_ledger" WHERE "id" = ${ledgerId} FOR UPDATE`;
}

/** Locks every ledger owned by this user (FOR UPDATE) so default-ledger swaps serialize. */
export async function lockOwnerLedgers(
  t: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  // Deterministic order, matching listOwnedIds: releaseOwnedLedgers takes
  // per-row locks in "id" asc order, and lock ordering in a consistent
  // direction is what keeps concurrent takers from deadlocking.
  await t.$queryRaw`SELECT "id" FROM "qianlai_ledger" WHERE "ownerId" = ${ownerId} ORDER BY "id" FOR UPDATE`;
}

/**
 * Transaction-scoped advisory lock keyed on the owner, serializing
 * default-ledger mutations (setDefaultLedger, ownership release). Row locks
 * alone can't guard a brand-new owner: an empty result set gives FOR UPDATE
 * nothing to lock under READ COMMITTED.
 */
export async function lockOwnerProvisioning(
  t: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which
  // $queryRaw refuses to deserialize.
  await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId})::bigint)`;
}

export const ledgerRepository = {
  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledger.findUnique({ where: { id } });
  },

  /** Ledgers the user owns or is a member of, with their membership role. */
  listForUser(userId: string, tx: Prisma.TransactionClient = prisma) {
    // Ordered by createdAt only: isDefault is owner-scoped state and must not
    // steer the sort of members who don't own the ledger — listLedgers
    // applies the owner's own default-first ordering in memory.
    return tx.ledger.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          where: { userId },
          select: { role: true },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  listOwnedIds(ownerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledger.findMany({
      where: { ownerId },
      select: { id: true },
      // Deterministic order: releaseOwnedLedgers takes row locks in this
      // order, so two concurrent user deletions that co-own each other's
      // ledgers can't acquire the locks crosswise and deadlock.
      orderBy: { id: "asc" },
    });
  },

  clearDefaultForOwner(ownerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledger.updateMany({
      where: { ownerId, isDefault: true },
      data: { isDefault: false },
    });
  },

  create(
    data: {
      ownerId: string;
      name: string;
      description?: string;
      currency?: string;
      isDefault?: boolean;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledger.create({ data });
  },

  update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      currency?: string;
      status?: string;
      lastEntryNo?: number;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledger.update({ where: { id }, data });
  },

  setOwner(id: string, ownerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledger.update({ where: { id }, data: { ownerId } });
  },

  setDefault(
    id: string,
    isDefault: boolean,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledger.update({ where: { id }, data: { isDefault } });
  },

  delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledger.delete({ where: { id } });
  },
};
