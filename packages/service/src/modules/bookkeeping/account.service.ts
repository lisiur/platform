import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { assertLedgerWritable } from "./access";
import { accountRepository } from "./account.repository";
import {
  ACCOUNT_TYPES,
  type AccountType,
  isBuiltinAccount,
  REAL_ACCOUNT_TYPES,
} from "./domain";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { realAccountRepository } from "./real-account.repository";

/**
 * Locks the ledger row (FOR UPDATE) and re-checks writability under the lock.
 * The route's assertLedgerWritable ran on a pre-transaction snapshot, so a
 * concurrent archive could otherwise land between the check and the write —
 * the same discipline createEntry applies to its lines.
 */
async function requireWritableLedger(
  ledgerId: string,
  tx: Prisma.TransactionClient,
) {
  await lockLedgerRow(tx, ledgerId);
  const ledger = await ledgerRepository.findById(ledgerId, tx);
  if (!ledger) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  assertLedgerWritable(ledger);
}

function parseType(value: string): AccountType {
  const type = ACCOUNT_TYPES.find((t) => t === value);
  if (!type) {
    throw new HTTPException(400, { message: `Invalid account type: ${value}` });
  }
  return type;
}

/**
 * Equity is system-managed: opening-balance and adjustment offset accounts are
 * seeded or auto-created, never user-created — users think in asset/liability/
 * income/expense and stray equity accounts would pollute net-worth reports.
 */
function assertUserCreatableType(type: string): void {
  if (type === "equity") {
    throw new HTTPException(400, {
      message:
        "Equity accounts are system-managed and cannot be created directly",
    });
  }
}

/**
 * Returns true if `targetId` appears anywhere on the parent chain above (or at)
 * `startId`. Guards against cycles when re-parenting an account (e.g. setting
 * A's parent to B when B already has A as an ancestor). One round-trip via a
 * recursive CTE in the repository.
 */
async function isAncestorOf(
  startId: string,
  targetId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  const ancestorIds = await accountRepository.findAncestorIds(startId, tx);
  return ancestorIds.includes(targetId);
}

/**
 * Validates that `realAccountId` is an active master account of `userId`'s
 * own whose type matches the pocket being linked, holding the master's row
 * lock while doing so (mirrored by deleteRealAccount) so a concurrent delete
 * cannot slip past this check and silently detach the pocket via SetNull.
 * Foreign ids 404 (no existence leak) — linking is always to the operating
 * user's own master.
 */
async function requireLinkableRealAccount(
  userId: string,
  realAccountId: string,
  pocketType: string,
  tx: Prisma.TransactionClient,
) {
  if (!REAL_ACCOUNT_TYPES.includes(pocketType as "asset" | "liability")) {
    throw new HTTPException(400, {
      message: "Only asset and liability accounts can link to a real account",
    });
  }
  const real = await realAccountRepository.lockById(realAccountId, tx);
  if (!real || real.ownerId !== userId) {
    throw new HTTPException(404, { message: "Real account not found" });
  }
  if (real.status !== "active") {
    throw new HTTPException(400, { message: "Real account is archived" });
  }
  if (real.type !== pocketType) {
    throw new HTTPException(400, {
      message: "Real account type must match the account type",
    });
  }
  return real;
}

export async function listAccounts(ledgerId: string) {
  const accounts = await accountRepository.listByLedger(ledgerId);
  return { accounts };
}

export async function createAccount(
  userId: string,
  ledgerId: string,
  data: {
    name: string;
    type: string;
    parentId?: string | null;
    icon?: string | null;
    meta?: Record<string, unknown> | null;
    realAccountId?: string | null;
  },
) {
  parseType(data.type);
  assertUserCreatableType(data.type);
  return prisma.$transaction(async (tx) => {
    await requireWritableLedger(ledgerId, tx);
    if (data.realAccountId) {
      await requireLinkableRealAccount(
        userId,
        data.realAccountId,
        data.type,
        tx,
      );
    }
    if (data.parentId) {
      const parent = await accountRepository.findById(data.parentId, tx);
      if (!parent || parent.ledgerId !== ledgerId) {
        throw new HTTPException(400, {
          message: "Parent account must belong to the same ledger",
        });
      }
      if (parent.status !== "active") {
        throw new HTTPException(400, {
          message: "Parent account is archived",
        });
      }
      if (parent.type !== data.type) {
        throw new HTTPException(400, {
          message: "Child account type must match its parent",
        });
      }
    }
    // Position is server-controlled: new accounts append to the end of their
    // sibling group; users reorder by dragging in the accounts tree.
    const parentId = data.parentId ?? null;
    const sortOrder =
      (await accountRepository.findMaxSortOrder(ledgerId, parentId, tx)) + 1;
    return accountRepository.create(
      { ...data, parentId, sortOrder, ledgerId },
      tx,
    );
  });
}

export async function updateAccount(
  userId: string,
  ledgerId: string,
  accountId: string,
  data: {
    /** Null/empty clears the override; absent leaves it untouched. */
    name?: string | null;
    parentId?: string | null;
    status?: string;
    icon?: string | null;
    meta?: Record<string, unknown> | null;
    /** String links, null unlinks, absent leaves the link untouched. */
    realAccountId?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    // Same lock createEntry takes: without it an account can be archived
    // between a concurrent post's account listing and its insert, landing
    // lines on a just-archived account.
    await requireWritableLedger(ledgerId, tx);
    const account = await requireAccountInLedger(accountId, ledgerId, tx);
    if (data.realAccountId) {
      await requireLinkableRealAccount(
        userId,
        data.realAccountId,
        account.type,
        tx,
      );
    }
    if (data.parentId) {
      if (data.parentId === accountId) {
        throw new HTTPException(400, {
          message: "An account cannot be its own parent",
        });
      }
      const parent = await accountRepository.findById(data.parentId, tx);
      if (!parent || parent.ledgerId !== ledgerId) {
        throw new HTTPException(400, {
          message: "Parent account must belong to the same ledger",
        });
      }
      if (await isAncestorOf(data.parentId, accountId, tx)) {
        throw new HTTPException(400, {
          message: "An account cannot be a descendant of itself",
        });
      }
      if (parent.type !== account.type) {
        throw new HTTPException(400, {
          message: "Child account type must match its parent",
        });
      }
      if (parent.status !== "active") {
        throw new HTTPException(400, {
          message: "Parent account is archived",
        });
      }
    }
    // Keep the tree consistent: an archived account must not have active
    // children (they'd be unreachable in the UI while still postable).
    if (data.status === "archived" && account.status === "active") {
      // Builtin accounts (opening balance / adjustment offset) must stay
      // postable or balance adjustments would silently create duplicates.
      if (isBuiltinAccount(account.flags)) {
        throw new HTTPException(409, {
          message: "Built-in accounts cannot be archived",
        });
      }
      const activeChildren = await accountRepository.countActiveChildren(
        accountId,
        tx,
      );
      if (activeChildren > 0) {
        throw new HTTPException(400, {
          message: "Archive or move this account's active children first",
        });
      }
    }
    // `name` is a display override above the code's localized label:
    // empty/null reverts to the label. The code itself is never cleared.
    // Only seeded (coded) accounts may go nameless — a user-created account
    // without a code would render nothing.
    let name = data.name;
    if (name !== undefined) {
      name = name?.trim() || null;
      if (name === null && !account.code) {
        throw new HTTPException(400, {
          message: "Name is required for accounts without a code",
        });
      }
    }
    return accountRepository.update(accountId, { ...data, name }, tx);
  });
}

/**
 * Applies drag-and-drop ordering from the accounts tree. The tree only moves
 * nodes within their current sibling group, so re-parenting is not accepted
 * here — each item's `parentId` is informational and the server groups by the
 * account's actual parent. After applying the new positions, every affected
 * sibling group is normalized to a gapless 0..n-1 sequence so repeated drags
 * can't accumulate sortOrder collisions.
 */
export async function reorderAccounts(
  ledgerId: string,
  items: Array<{ id: string; parentId: string | null; sortOrder: number }>,
) {
  const accounts = await prisma.$transaction(async (tx) => {
    await requireWritableLedger(ledgerId, tx);
    const existing = await accountRepository.findManyByIds(
      ledgerId,
      items.map((item) => item.id),
      tx,
    );
    if (existing.length !== new Set(items.map((item) => item.id)).size) {
      throw new HTTPException(404, { message: "Account not found" });
    }
    const accountById = new Map(existing.map((a) => [a.id, a]));
    for (const item of items) {
      const account = accountById.get(item.id);
      if (!account || account.parentId !== item.parentId) {
        throw new HTTPException(400, {
          message: "Cannot move account to a different parent via reorder",
        });
      }
      await accountRepository.update(
        item.id,
        { sortOrder: item.sortOrder },
        tx,
      );
    }
    const affectedParentIds = new Set(
      existing.map((account) => account.parentId),
    );
    for (const parentId of affectedParentIds) {
      const siblings = await accountRepository.listSiblings(
        ledgerId,
        parentId,
        tx,
      );
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].sortOrder !== i) {
          await accountRepository.update(siblings[i].id, { sortOrder: i }, tx);
        }
      }
    }
    return accountRepository.listByLedger(ledgerId, tx);
  });
  return { accounts };
}

/**
 * Deletes an account. Accounts that still have journal lines are refused
 * (archive instead); accounts with children must have children deleted first.
 * Guards run under the ledger row lock (the same lock `createEntry` takes)
 * so a concurrent post can't slip lines onto the account between the count
 * and the delete — that interleave would surface as an unhandled FK 500.
 */
export async function deleteAccount(ledgerId: string, accountId: string) {
  await prisma.$transaction(async (tx) => {
    await requireWritableLedger(ledgerId, tx);
    const account = await requireAccountInLedger(accountId, ledgerId, tx);
    if (isBuiltinAccount(account.flags)) {
      throw new HTTPException(409, {
        message: "Built-in accounts cannot be deleted",
      });
    }
    const [lineCount, childCount] = await Promise.all([
      accountRepository.countLines(accountId, tx),
      accountRepository.countChildren(accountId, tx),
    ]);
    if (lineCount > 0) {
      throw new HTTPException(409, {
        message:
          "This account has journal lines and cannot be deleted; archive it instead",
      });
    }
    if (childCount > 0) {
      throw new HTTPException(400, {
        message: "Delete or move this account's children first",
      });
    }
    await accountRepository.delete(accountId, tx);
  });
  return { success: true as const };
}

async function requireAccountInLedger(
  accountId: string,
  ledgerId: string,
  tx?: Prisma.TransactionClient,
) {
  const account = await accountRepository.findById(accountId, tx);
  if (!account || account.ledgerId !== ledgerId) {
    throw new HTTPException(404, { message: "Account not found" });
  }
  return account;
}
