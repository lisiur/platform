import { accountRepository } from "./account.repository";
import type { AccountType, LedgerRole } from "./domain";
import { journalRepository } from "./journal.repository";

type AccountSums = Map<string, { debit: number; credit: number }>;

/**
 * Only owners see entry creators' email addresses — same policy as
 * `listMembers`: non-owners must not be able to harvest members' emails
 * through the dashboard's recent entries.
 */
function redactEntryCreatorEmail<
  T extends { createdBy?: { email: string | null } | null },
>(entry: T, viewerRole: LedgerRole): T {
  return viewerRole === "owner" || !entry.createdBy
    ? entry
    : { ...entry, createdBy: { ...entry.createdBy, email: null } };
}

async function sumsByAccount(
  ledgerId: string,
  window: { from?: Date; to?: Date } = {},
): Promise<AccountSums> {
  const grouped = await journalRepository.sumLinesByAccount(ledgerId, window);
  const map: AccountSums = new Map();
  for (const row of grouped) {
    map.set(row.accountId, {
      debit: Number(row._sum.debit ?? 0),
      credit: Number(row._sum.credit ?? 0),
    });
  }
  return map;
}

/** debit − credit, flipped for credit-normal account types. */
function signedBalance(
  type: AccountType,
  debit: number,
  credit: number,
): number {
  return type === "asset" || type === "expense"
    ? round(debit - credit)
    : round(credit - debit);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** When `window.to` is set, balances only reflect entries dated <= that day. */
export async function trialBalance(
  ledgerId: string,
  window: { from?: Date; to?: Date } = {},
) {
  const [accounts, sums] = await Promise.all([
    accountRepository.listByLedger(ledgerId),
    sumsByAccount(ledgerId, window),
  ]);
  const rows = accounts.map((account) => {
    const { debit = 0, credit = 0 } = sums.get(account.id) ?? {};
    return {
      id: account.id,
      name: account.name,
      type: account.type as AccountType,
      sortOrder: account.sortOrder,
      totalDebit: round(debit),
      totalCredit: round(credit),
      balance: signedBalance(account.type as AccountType, debit, credit),
    };
  });
  return {
    accounts: rows,
    totals: {
      debit: round(rows.reduce((acc, r) => acc + r.totalDebit, 0)),
      credit: round(rows.reduce((acc, r) => acc + r.totalCredit, 0)),
    },
  };
}

export async function incomeStatement(
  ledgerId: string,
  window: { from?: Date; to?: Date } = {},
) {
  const [accounts, sums] = await Promise.all([
    accountRepository.listByLedger(ledgerId),
    sumsByAccount(ledgerId, window),
  ]);
  return buildStatementRows(accounts, sums);
}

export async function dashboard(
  ledgerId: string,
  viewerRole: LedgerRole = "viewer",
  now = new Date(),
) {
  const accounts = await accountRepository.listByLedger(ledgerId);
  const allTimeSums = await sumsByAccount(ledgerId);

  const netWorthAccounts = accounts.filter(
    (a) => a.type === "asset" || a.type === "liability",
  );
  let assets = 0;
  let liabilities = 0;
  for (const account of netWorthAccounts) {
    const { debit = 0, credit = 0 } = allTimeSums.get(account.id) ?? {};
    if (account.type === "asset") {
      assets += debit - credit;
    } else {
      liabilities += credit - debit;
    }
  }

  // Entry dates are stored at UTC midnight, so the month window must be
  // computed in UTC too — a server-local window drops (or adds) entries on
  // the 1st/last day of the month depending on the server's timezone.
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  const monthSums = await sumsByAccount(ledgerId, {
    from: monthStart,
    to: monthEnd,
  });
  const statement = buildStatementRows(accounts, monthSums);

  const recentEntries = (await journalRepository.listRecent(ledgerId, 5)).map(
    (e) => redactEntryCreatorEmail(e, viewerRole),
  );

  return {
    assets: round(assets),
    liabilities: round(liabilities),
    netWorth: round(assets - liabilities),
    month: {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      ...statement,
    },
    recentEntries,
  };
}

/** Same shape as `incomeStatement` but uses pre-loaded accounts/sums to avoid
 *  re-querying when the caller (e.g. `dashboard`) already has them. */
function buildStatementRows(
  accounts: Awaited<ReturnType<typeof accountRepository.listByLedger>>,
  sums: AccountSums,
) {
  const mapAccount = (account: (typeof accounts)[number]) => {
    const { debit = 0, credit = 0 } = sums.get(account.id) ?? {};
    return {
      id: account.id,
      name: account.name,
      type: account.type as AccountType,
      sortOrder: account.sortOrder,
      balance: signedBalance(account.type as AccountType, debit, credit),
    };
  };
  const income = accounts
    .filter((a) => a.type === "income")
    .map(mapAccount)
    .filter((a) => a.balance !== 0);
  const expense = accounts
    .filter((a) => a.type === "expense")
    .map(mapAccount)
    .filter((a) => a.balance !== 0);
  const totalIncome = round(income.reduce((acc, a) => acc + a.balance, 0));
  const totalExpense = round(expense.reduce((acc, a) => acc + a.balance, 0));
  return {
    income,
    expense,
    totalIncome,
    totalExpense,
    net: round(totalIncome - totalExpense),
  };
}
