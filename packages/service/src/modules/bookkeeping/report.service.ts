import { accountRepository } from "./account.repository";
import type { AccountType, LedgerRole } from "./domain";
import { journalRepository } from "./journal.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";

type AccountSums = Map<string, { debit: number; credit: number }>;

/**
 * Only owners see entry creators' and participants' email addresses — same
 * policy as `listMembers`: non-owners must not be able to harvest members'
 * emails through the dashboard's recent entries.
 */
function redactEntryCreatorEmail<
  T extends {
    createdBy?: { email: string | null } | null;
    participants?: Array<{
      ledgerMember: { user: { email: string | null } };
    }>;
  },
>(entry: T, viewerRole: LedgerRole): T {
  if (viewerRole === "owner") return entry;
  return {
    ...entry,
    createdBy: entry.createdBy
      ? { ...entry.createdBy, email: null }
      : entry.createdBy,
    participants: entry.participants?.map((p) => ({
      ...p,
      ledgerMember: {
        ...p.ledgerMember,
        user: { ...p.ledgerMember.user, email: null },
      },
    })),
  };
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
      code: account.code,
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

/**
 * Per-member turnover: the gross amount (total debits) of every entry a
 * member is tagged on, summed over the window. An entry tagged with several
 * members counts in full for each of them — "related turnover", not a split
 * (amount splits live in the journal lines). All current members are
 * returned, zero turnover included, so clients can render a complete table.
 */
export async function memberTurnover(
  ledgerId: string,
  window: { from?: Date; to?: Date } = {},
) {
  const [members, tagged] = await Promise.all([
    ledgerMemberRepository.listByLedger(ledgerId),
    journalRepository.listTaggedEntries(ledgerId, window),
  ]);

  const turnoverByMember = new Map<
    string,
    { turnover: number; entries: number }
  >();
  for (const entry of tagged) {
    // Total debits of an entry equal total credits: the gross amount.
    const gross = entry.lines.reduce(
      (acc, line) => acc + Number(line.debit),
      0,
    );
    for (const participant of entry.participants) {
      const current = turnoverByMember.get(participant.ledgerMemberId) ?? {
        turnover: 0,
        entries: 0,
      };
      current.turnover += gross;
      current.entries += 1;
      turnoverByMember.set(participant.ledgerMemberId, current);
    }
  }

  const rows = members.map((member) => {
    const { turnover = 0, entries = 0 } = turnoverByMember.get(member.id) ?? {};
    return {
      ledgerMemberId: member.id,
      userId: member.userId,
      name: member.user?.name ?? member.userId,
      avatar: member.user?.avatar ?? null,
      role: member.role as LedgerRole,
      entryCount: entries,
      turnover: round(turnover),
    };
  });

  return {
    members: rows,
    totals: {
      entries: tagged.length,
      turnover: round(rows.reduce((acc, r) => acc + r.turnover, 0)),
    },
  };
}

export async function dashboard(
  ledgerId: string,
  viewerRole: LedgerRole = "viewer",
  now = new Date(),
  window: { from?: Date; to?: Date } = {},
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

  // The month window arrives as explicit UTC instants (mirrors the other
  // report endpoints — the caller owns the timezone math). Defaults to the
  // current UTC month: entry dates are stored at UTC midnight, so a
  // server-local window drops (or adds) entries on the 1st/last day of the
  // month depending on the server's timezone.
  const monthStart =
    window.from ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd =
    window.to ??
    new Date(
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
      year: monthStart.getUTCFullYear(),
      month: monthStart.getUTCMonth() + 1,
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
      code: account.code,
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
