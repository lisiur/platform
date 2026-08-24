import { HTTPException } from "hono/http-exception";
import type { BookAccount } from "#generated/prisma/client";
import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { assertLedgerWritable } from "./access";
import { accountRepository } from "./account.repository";
import { type LedgerRole, MAX_LINE_CENTS } from "./domain";
import { type EntryWindow, journalRepository } from "./journal.repository";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { isForeignKeyViolation } from "./prisma-errors";

export type JournalLineInput = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
};

/** A validated journal line with amounts normalized to integer cents. */
export type NormalizedJournalLine = {
  accountId: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
};

/**
 * Pure validation of journal lines for a double-entry post:
 * - at least 2 lines
 * - each line has exactly one positive side (debit XOR credit) after rounding to cents
 * - total debits equal total credits on the rounded (i.e. stored) amounts
 * - every referenced account exists, belongs to the ledger and is active
 *
 * Amounts are rounded to integer cents BEFORE balancing so what is validated
 * is exactly what gets stored. Returns the normalized lines for persistence.
 */
export function validateJournalLines(
  lines: JournalLineInput[],
  ledgerAccounts: BookAccount[],
): NormalizedJournalLine[] {
  if (lines.length < 2) {
    throw new HTTPException(400, {
      message: "A journal entry needs at least 2 lines",
    });
  }
  const accountsById = new Map(ledgerAccounts.map((a) => [a.id, a]));
  const normalized: NormalizedJournalLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new HTTPException(400, {
        message: "Line amounts cannot be negative",
      });
    }
    const debitCents = Math.round(line.debit * 100);
    const creditCents = Math.round(line.credit * 100);
    if (debitCents > MAX_LINE_CENTS || creditCents > MAX_LINE_CENTS) {
      throw new HTTPException(400, {
        message: `Line amounts cannot exceed 9,999,999,999.99`,
      });
    }
    if (debitCents > 0 === creditCents > 0) {
      throw new HTTPException(400, {
        message:
          "Each line must have exactly one positive amount on either debit or credit",
      });
    }
    const account = accountsById.get(line.accountId);
    if (!account) {
      throw new HTTPException(400, {
        message: "All lines must reference accounts from this ledger",
      });
    }
    if (account.status !== "active") {
      throw new HTTPException(400, {
        message: `Account ${account.name} is archived`,
      });
    }
    totalDebitCents += debitCents;
    totalCreditCents += creditCents;
    normalized.push({
      accountId: line.accountId,
      debitCents,
      creditCents,
      memo: line.memo,
    });
  }
  if (totalDebitCents !== totalCreditCents) {
    throw new HTTPException(400, {
      message: "Entry is not balanced: total debits must equal total credits",
    });
  }
  return normalized;
}

/**
 * Only owners see entry creators' email addresses — same policy as
 * `listMembers`: non-owners must not be able to harvest members' emails
 * through the journal history.
 */
function redactEntryCreatorEmail<
  T extends { createdBy?: { email: string | null } | null },
>(entry: T, viewerRole: LedgerRole): T {
  return viewerRole === "owner" || !entry.createdBy
    ? entry
    : { ...entry, createdBy: { ...entry.createdBy, email: null } };
}

export async function listEntries(
  ledgerId: string,
  opts: { limit?: number; offset?: number } & EntryWindow,
  viewerRole: LedgerRole,
) {
  const [entries, total] = await Promise.all([
    journalRepository.listEntries(ledgerId, opts),
    journalRepository.countEntries(ledgerId, opts),
  ]);
  return {
    entries: entries.map((e) => redactEntryCreatorEmail(e, viewerRole)),
    total,
  };
}

export async function getEntry(
  ledgerId: string,
  entryId: string,
  viewerRole: LedgerRole = "viewer",
) {
  const entry = await journalRepository.findById(entryId);
  if (!entry || entry.ledgerId !== ledgerId) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }
  return redactEntryCreatorEmail(entry, viewerRole);
}

/**
 * Creates a posted journal entry. The ledger row is locked (FOR UPDATE) inside
 * the transaction so the per-ledger entryNo sequence is race-free; lines are
 * validated under the same lock against a transaction-consistent account list,
 * and the archived guard is re-evaluated under the lock (the route's check ran
 * on a pre-transaction snapshot).
 */
export async function createEntry(
  userId: string,
  ledgerId: string,
  data: { date: Date; memo?: string; lines: JournalLineInput[] },
) {
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const ledgerAccounts = await accountRepository.listByLedger(ledgerId, tx);
    return postEntryInTransaction(tx, userId, ledgerId, ledger, {
      ...data,
      rawLines: data.lines,
      ledgerAccounts,
    });
  });
}

/**
 * Validates and posts an entry inside an existing transaction. Caller must
 * already hold the ledger row lock and have re-checked writability (e.g.
 * `createEntry` above, or `setAccountBalance`) so entryNo stays race-free and
 * line validation runs against a transaction-consistent account list.
 */
export async function postEntryInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  ledgerId: string,
  ledger: { lastEntryNo: number },
  data: {
    date: Date;
    memo?: string;
    rawLines: JournalLineInput[];
    ledgerAccounts: BookAccount[];
  },
) {
  const lines = validateJournalLines(data.rawLines, data.ledgerAccounts);
  // entryNo comes from the ledger's monotonic counter so numbers are never
  // reused, even after deleting the highest-numbered entry. Race-free
  // because we hold the ledger row lock.
  const entryNo = ledger.lastEntryNo + 1;
  await ledgerRepository.update(ledgerId, { lastEntryNo: entryNo }, tx);
  try {
    return await journalRepository.createEntry(
      {
        ledgerId,
        entryNo,
        date: data.date,
        memo: data.memo,
        createdById: userId,
        lines: lines.map((line) => ({
          accountId: line.accountId,
          debit: new Prisma.Decimal(line.debitCents).div(100),
          credit: new Prisma.Decimal(line.creditCents).div(100),
          memo: line.memo,
        })),
      },
      tx,
    );
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HTTPException(400, {
        message: "A referenced account no longer exists in this ledger",
      });
    }
    throw err;
  }
}

/**
 * Journal entries are immutable once posted; correction means delete + re-post.
 * Runs under the ledger row lock with the archived guard re-evaluated there,
 * so a ledger archived after the route's check still refuses the delete.
 */
export async function deleteEntry(ledgerId: string, entryId: string) {
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const entry = await journalRepository.findById(entryId, tx);
    if (!entry || entry.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Journal entry not found" });
    }
    await journalRepository.delete(entry.id, tx);
  });
  return { success: true as const };
}
