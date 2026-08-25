import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { assertLedgerWritable } from "./access";
import { accountRepository } from "./account.repository";
import {
  ADJUSTMENT_OFFSET_ACCOUNT_FLAG,
  BUILTIN_ACCOUNT_FLAG,
  MAX_LINE_CENTS,
  type SeedLocale,
} from "./domain";
import { journalRepository } from "./journal.repository";
import {
  type JournalLineInput,
  postEntryInTransaction,
} from "./journal.service";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";

/** Only pockets whose balance a user may set directly; equity is system-managed. */
const ADJUSTABLE_TYPES = ["asset", "liability"] as const;

const OFFSET_ACCOUNT_NAME: Record<SeedLocale, string> = {
  en: "Balance Adjustment",
  zh: "余额调整",
};

export type SetAccountBalanceInput = {
  /** Target signed balance in major units (credit-normal for liabilities). */
  balance: number;
  /** UTC midnight of the as-of day; entries dated after it are left untouched. */
  date: Date;
  memo?: string;
};

/** Current signed balance (in cents) of `account` from lines dated <= `asOf`. */
function balanceAsOfCents(
  type: string,
  debitCents: number,
  creditCents: number,
): number {
  return type === "asset" ? debitCents - creditCents : creditCents - debitCents;
}

/**
 * Sets an asset/liability account's balance as of a date (default today) by
 * posting a two-line adjustment entry against the system equity account:
 * debit-normal accounts gain the delta on debit, credit-normal on credit.
 * The journal stays balanced and auditable; later-dated entries are not
 * touched, so the account's current balance shifts by the same delta.
 */
export async function setAccountBalance(
  userId: string,
  ledgerId: string,
  accountId: string,
  data: SetAccountBalanceInput,
  locale: SeedLocale = "en",
) {
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const account = await accountRepository.findById(accountId, tx);
    if (!account || account.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Account not found" });
    }
    if (
      !ADJUSTABLE_TYPES.includes(
        account.type as (typeof ADJUSTABLE_TYPES)[number],
      )
    ) {
      throw new HTTPException(400, {
        message: "Only asset and liability accounts can have their balance set",
      });
    }
    if (account.status !== "active") {
      throw new HTTPException(400, {
        message: `Account ${account.name ?? account.code} is archived`,
      });
    }

    const asOfEnd = new Date(data.date.getTime() + 24 * 60 * 60 * 1000 - 1);
    const grouped = await journalRepository.sumLinesByAccount(
      ledgerId,
      { to: asOfEnd },
      tx,
    );
    const sums = grouped.find((row) => row.accountId === accountId);
    const currentCents = balanceAsOfCents(
      account.type,
      Math.round(Number(sums?._sum.debit ?? 0) * 100),
      Math.round(Number(sums?._sum.credit ?? 0) * 100),
    );
    const targetCents = Math.round(data.balance * 100);
    const deltaCents = targetCents - currentCents;
    if (deltaCents === 0) {
      return { adjusted: false as const, entry: null };
    }
    if (Math.abs(deltaCents) > MAX_LINE_CENTS) {
      throw new HTTPException(400, {
        message: "Line amounts cannot exceed 9,999,999,999.99",
      });
    }

    const offset =
      (await accountRepository.findAdjustmentOffsetAccount(ledgerId, tx)) ??
      // Legacy ledgers predate the builtin flag: their seeded opening-balance
      // equity account is still the right offset.
      (await accountRepository.findFirstActiveByType(ledgerId, "equity", tx)) ??
      (await accountRepository.create(
        {
          ledgerId,
          name: OFFSET_ACCOUNT_NAME[locale],
          code: "balanceAdjustment",
          type: "equity",
          sortOrder: 61,
          icon: "⚖️",
          flags: [BUILTIN_ACCOUNT_FLAG, ADJUSTMENT_OFFSET_ACCOUNT_FLAG],
        },
        tx,
      ));

    const amount = Math.abs(deltaCents) / 100;
    // Debit-normal target (asset): delta up => debit target. Credit-normal
    // (liability): delta up => credit target. The offset line mirrors it.
    const targetOnDebit =
      account.type === "asset" ? deltaCents > 0 : deltaCents < 0;
    const rawLines: JournalLineInput[] = [
      {
        accountId,
        debit: targetOnDebit ? amount : 0,
        credit: targetOnDebit ? 0 : amount,
      },
      {
        accountId: offset.id,
        debit: targetOnDebit ? 0 : amount,
        credit: targetOnDebit ? amount : 0,
      },
    ];

    const ledgerAccounts = await accountRepository.listByLedger(ledgerId, tx);
    const entry = await postEntryInTransaction(tx, userId, ledgerId, ledger, {
      date: data.date,
      memo: data.memo,
      rawLines,
      ledgerAccounts,
    });
    return { adjusted: true as const, entry };
  });
}
