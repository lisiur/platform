import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { accountRepository } from "./account.repository";
import {
  LEDGER_STATUSES,
  type LedgerRole,
  type LedgerStatus,
  STARTER_ACCOUNTS,
} from "./domain";
import { journalRepository } from "./journal.repository";
import {
  ledgerRepository,
  lockLedgerRow,
  lockOwnerLedgers,
  lockOwnerProvisioning,
} from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";

function parseStatus(value: string): LedgerStatus {
  const status = LEDGER_STATUSES.find((s) => s === value);
  if (!status) {
    throw new HTTPException(400, {
      message: `Invalid ledger status: ${value}`,
    });
  }
  return status;
}

function serializeLedger(
  userId: string,
  row: Awaited<ReturnType<typeof ledgerRepository.listForUser>>[number],
) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    currency: row.currency,
    status: row.status as LedgerStatus,
    // isDefault is owner-scoped state: a shared ledger flagged default by its
    // owner must not leak into other members' lists (their clients use it to
    // auto-select the active ledger).
    isDefault: row.ownerId === userId && row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    myRole:
      row.ownerId === userId
        ? "owner"
        : ((row.members[0]?.role ?? "viewer") as LedgerRole),
    membersCount: row._count.members,
    shared: row.ownerId !== userId,
  };
}

export async function listLedgers(userId: string) {
  const rows = await ledgerRepository.listForUser(userId);
  // Default-first in memory, keyed on ownership: sorting by the raw isDefault
  // column in SQL would let a shared ledger's owner-side flag steer the
  // member's sort order even though serializeLedger nulls the flag for them.
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.ownerId === userId && b.isDefault) -
        Number(a.ownerId === userId && a.isDefault) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return { ledgers: sorted.map((row) => serializeLedger(userId, row)) };
}

export async function createLedger(
  userId: string,
  data: {
    name: string;
    description?: string;
    currency?: string;
    seedStarterAccounts?: boolean;
  },
) {
  const accounts = data.seedStarterAccounts === false ? [] : STARTER_ACCOUNTS;
  return prisma.$transaction(async (tx) => {
    const ledger = await ledgerRepository.create(
      {
        ownerId: userId,
        name: data.name,
        description: data.description,
        currency: data.currency,
      },
      tx,
    );
    await ledgerMemberRepository.create(
      { ledgerId: ledger.id, userId, role: "owner" },
      tx,
    );
    if (accounts.length > 0) {
      await accountRepository.createStarterAccounts(ledger.id, accounts, tx);
    }
    return ledger;
  });
}

export async function updateLedger(
  userId: string,
  ledgerId: string,
  data: {
    name?: string;
    description?: string | null;
    currency?: string;
    status?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    // Lock the ledger row and re-read under it so the guards see the current
    // state, not a snapshot taken by the route's access check before a
    // concurrent archive or ownership transfer.
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    if (ledger.ownerId !== userId) {
      throw new HTTPException(403, {
        message: "Only the ledger owner can perform this action",
      });
    }
    if (ledger.status !== "active") {
      const writableKeys = Object.keys(data).filter(
        (k) => data[k as keyof typeof data] !== undefined,
      );
      const isUnarchive =
        writableKeys.length === 1 &&
        writableKeys[0] === "status" &&
        data.status === "active";
      if (!isUnarchive) {
        throw new HTTPException(400, {
          message: "This ledger is archived; only un-archiving is allowed",
        });
      }
    }
    if (data.status) parseStatus(data.status);
    // Archiving the default ledger drops the flag: a read-only archived
    // ledger must not be auto-selected by clients as the default. A new
    // default is chosen explicitly via setDefaultLedger.
    if (data.status === "archived" && ledger.isDefault) {
      await ledgerRepository.setDefault(ledgerId, false, tx);
    }
    return ledgerRepository.update(ledgerId, data, tx);
  });
}

export async function setDefaultLedger(userId: string, ledgerId: string) {
  await prisma.$transaction(async (tx) => {
    // Same advisory-then-rows lock order as releaseOwnedLedgers' row locking
    // so default swaps serialize against concurrent ownership transfers.
    await lockOwnerProvisioning(tx, userId);
    await lockOwnerLedgers(tx, userId);
    // Lock the target row too (last, so no lock-order cycle with
    // transferOwnership) and re-verify under the lock: ownership and status
    // may have changed since the route's access check.
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    if (ledger.ownerId !== userId) {
      throw new HTTPException(403, {
        message: "Only the ledger owner can perform this action",
      });
    }
    if (ledger.status !== "active") {
      throw new HTTPException(400, {
        message: "An archived ledger cannot be the default ledger",
      });
    }
    await ledgerRepository.clearDefaultForOwner(userId, tx);
    await ledgerRepository.setDefault(ledgerId, true, tx);
  });
  return { success: true as const };
}

export async function deleteLedger(userId: string, ledgerId: string) {
  await prisma.$transaction(async (tx) => {
    // Ownership is re-verified under the row lock (like every other mutating
    // service here): a concurrent transferOwnership that commits after the
    // route's access check must not let the former owner delete the ledger.
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    if (ledger.ownerId !== userId) {
      throw new HTTPException(403, {
        message: "Only the ledger owner can perform this action",
      });
    }
    // Entries must be deleted before the ledger itself: the cascade from
    // Ledger to BookAccount converges with the Restrict from JournalLine to
    // BookAccount, and Postgres can reach the account delete before the
    // entry cascade, tripping the RESTRICT while lines still reference the
    // account.
    await journalRepository.deleteByLedger(ledgerId, tx);
    await ledgerRepository.delete(ledgerId, tx);
  });
  return { success: true as const };
}

/**
 * Reassigns or removes every ledger the user owns, in preparation for user
 * deletion. Shared ledgers (other members present) survive: the earliest-joined
 * member is promoted to owner. Solo ledgers are deleted outright — nobody
 * else's data references them. Must run before the user delete (the FK is
 * Restrict) and inside the same transaction.
 */
export async function releaseOwnedLedgers(
  userId: string,
  tx: Prisma.TransactionClient,
) {
  const owned = await ledgerRepository.listOwnedIds(userId, tx);
  for (const { id } of owned) {
    // Lock the ledger row first — same lock every other ledger writer takes
    // (e.g. transferOwnership) — then re-verify ownership under it: a
    // concurrent transfer may have already reassigned this ledger, and
    // promoting an heir here too would leave two members holding the owner
    // role.
    await lockLedgerRow(tx, id);
    const ledger = await ledgerRepository.findById(id, tx);
    if (!ledger || ledger.ownerId !== userId) {
      continue;
    }
    const heir = await ledgerMemberRepository.findFirstOtherMember(
      id,
      userId,
      tx,
    );
    if (heir) {
      await ledgerMemberRepository.updateRole(id, heir.userId, "owner", tx);
      await ledgerRepository.setOwner(id, heir.userId, tx);
      // Parity with transferOwnership: the heir may already have their own
      // default, and two defaults (resolved by earliest createdAt) would
      // silently shadow it.
      await ledgerRepository.setDefault(id, false, tx);
    } else {
      // See deleteLedger: entries go first or the BookAccount RESTRICT fires.
      await journalRepository.deleteByLedger(id, tx);
      await ledgerRepository.delete(id, tx);
    }
  }
}
