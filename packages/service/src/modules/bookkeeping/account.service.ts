import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { assertLedgerWritable } from "./access";
import { accountRepository } from "./account.repository";
import { ACCOUNT_TYPES, type AccountType } from "./domain";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { isUniqueViolation } from "./prisma-errors";

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

export async function listAccounts(ledgerId: string) {
  const accounts = await accountRepository.listByLedger(ledgerId);
  return { accounts };
}

export async function createAccount(
  ledgerId: string,
  data: { code: string; name: string; type: string; parentId?: string | null },
) {
  parseType(data.type);
  return prisma.$transaction(async (tx) => {
    await requireWritableLedger(ledgerId, tx);
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
    }
    const duplicate = await accountRepository.findByCode(
      ledgerId,
      data.code,
      tx,
    );
    if (duplicate) {
      throw new HTTPException(409, {
        message: `Account code ${data.code} already exists in this ledger`,
      });
    }
    try {
      return await accountRepository.create({ ...data, ledgerId }, tx);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HTTPException(409, {
          message: `Account code ${data.code} already exists in this ledger`,
        });
      }
      throw err;
    }
  });
}

export async function updateAccount(
  ledgerId: string,
  accountId: string,
  data: {
    code?: string;
    name?: string;
    parentId?: string | null;
    status?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    // Same lock createEntry takes: without it an account can be archived
    // between a concurrent post's account listing and its insert, landing
    // lines on a just-archived account.
    await requireWritableLedger(ledgerId, tx);
    const account = await requireAccountInLedger(accountId, ledgerId, tx);
    if (data.code && data.code !== account.code) {
      const duplicate = await accountRepository.findByCode(
        ledgerId,
        data.code,
        tx,
      );
      if (duplicate && duplicate.id !== accountId) {
        throw new HTTPException(409, {
          message: `Account code ${data.code} already exists in this ledger`,
        });
      }
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
      if (parent.status !== "active") {
        throw new HTTPException(400, {
          message: "Parent account is archived",
        });
      }
    }
    // Keep the tree consistent: an archived account must not have active
    // children (they'd be unreachable in the UI while still postable).
    if (data.status === "archived" && account.status === "active") {
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
    try {
      return await accountRepository.update(accountId, data, tx);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HTTPException(409, {
          message: "Account code already in use",
        });
      }
      throw err;
    }
  });
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
    await requireAccountInLedger(accountId, ledgerId, tx);
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
