import type { Prisma } from "#generated/prisma/client";
import { accountRepository } from "./account.repository";
import type { AccountType, LedgerRole } from "./domain";
import { journalRepository, type SumLinesWindow } from "./journal.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";
import { projectMemberRepository } from "./project-member.repository";

type AccountSums = Map<string, { debit: number; credit: number }>;

/**
 * Only owners see entry creators'/payers' and participants' email
 * addresses — same policy as `listMembers`: non-owners must not be able to
 * harvest members' emails through the dashboard's recent entries.
 */
function redactEntryCreatorEmail<
  T extends {
    createdBy?: { email: string | null } | null;
    paidBy?: { email: string | null } | null;
    participants?: Array<{ user: { email: string | null } }>;
  },
>(entry: T, viewerRole: LedgerRole): T {
  if (viewerRole === "owner") return entry;
  return {
    ...entry,
    createdBy: entry.createdBy
      ? { ...entry.createdBy, email: null }
      : entry.createdBy,
    paidBy: entry.paidBy ? { ...entry.paidBy, email: null } : entry.paidBy,
    participants: entry.participants?.map((p) => ({
      ...p,
      user: { ...p.user, email: null },
    })),
  };
}

async function sumsByAccount(
  ledgerId: string,
  window: SumLinesWindow = {},
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

/** Line shape returned by `listShareEntries`. */
interface ShareLine {
  accountId: string;
  debit: Prisma.Decimal | number;
  credit: Prisma.Decimal | number;
  account: { type: string };
}

interface ShareEntry {
  paidById: string | null;
  lines: ShareLine[];
  participants: Array<{ userId: string }>;
}

/** A line's flow amount in integer cents, signed per statement convention:
 * expense lines positive (debit − credit), income lines positive on the
 * credit side (credit − debit); asset/liability lines contribute nothing. */
function lineFlowCents(line: ShareLine): number {
  const debit = Math.round(Number(line.debit) * 100);
  const credit = Math.round(Number(line.credit) * 100);
  if (line.account.type === "expense") return debit - credit;
  if (line.account.type === "income") return credit - debit;
  return 0;
}

/** The entry's splittable value in integer cents: expense − income.
 * Mirrors the client's `entryValueCents` exactly. */
function entryValueCents(lines: ShareLine[]): number {
  let value = 0;
  for (const line of lines) {
    const debit = Math.round(Number(line.debit) * 100);
    const credit = Math.round(Number(line.credit) * 100);
    if (line.account.type === "expense" || line.account.type === "income") {
      value += debit - credit;
    }
  }
  return value;
}

/** The entry's split set: deduped participant userIds sorted by userId —
 *  the same ordering the settlement remainder math uses. */
function splitSetOf(entry: ShareEntry): string[] {
  return [...new Set(entry.participants.map((p) => p.userId))].sort();
}

/** One slice of `value` in an equal split across `splitUserIds`: the base
 *  share plus one cent when this index carries the division remainder. */
function sliceCents(
  value: number,
  splitUserIds: string[],
  index: number,
): number {
  const base = Math.floor(value / splitUserIds.length);
  const remainder = value - base * splitUserIds.length;
  return base + (index < remainder ? 1 : 0);
}

/**
 * The viewer's share of an entry's value in cents: equal split across the
 * tagged participant set (deduped, sorted by userId, remainder to the
 * earliest ids — mirrors the settlement math), full value when untagged
 * (personal entries: the payer bears it all — the payer fronts the money,
 * not necessarily the creator). Zero when the viewer is not in the split
 * set.
 */
function viewerShareCents(entry: ShareEntry, viewerUserId: string): number {
  const value = entryValueCents(entry.lines);
  if (value === 0) return 0;
  const tagged = splitSetOf(entry);
  const splitUserIds =
    tagged.length > 0 ? tagged : [entry.paidById ?? viewerUserId];
  const index = splitUserIds.indexOf(viewerUserId);
  if (index === -1) return 0;
  return sliceCents(value, splitUserIds, index);
}

/**
 * The ledger members' COMBINED share of an entry's value in cents: equal
 * split across the tagged participant set (same split math as above), with
 * only the members' slices summed in — project outsiders hold no roster
 * row, so their slices fall out of the split and stop feeding the family's
 * income/expense. Untagged entries fall back to the payer alone: a
 * member's personal entry counts in full, an outsider-paid legacy row
 * contributes nothing. Zero when nobody in the split set is a member.
 */
function memberSharesCents(
  entry: ShareEntry,
  memberUserIds: ReadonlySet<string>,
): number {
  const value = entryValueCents(entry.lines);
  if (value === 0) return 0;
  const tagged = splitSetOf(entry);
  const splitUserIds =
    tagged.length > 0 ? tagged : entry.paidById ? [entry.paidById] : [];
  let share = 0;
  for (let index = 0; index < splitUserIds.length; index++) {
    if (memberUserIds.has(splitUserIds[index])) {
      share += sliceCents(value, splitUserIds, index);
    }
  }
  return share;
}

/**
 * Per-account sums of the given per-entry share over the entries, feeding
 * `buildStatementRows`. Each line is attributed its share/value fraction
 * (rounded to cents), then the per-entry rounding drift is absorbed by the
 * entry's largest line so Σ attributed − Σ income attributed equals the
 * entry's share exactly.
 */
function shareSumsByAccount(
  entries: ShareEntry[],
  shareOf: (entry: ShareEntry) => number,
) {
  const sums: AccountSums = new Map();
  const add = (
    accountId: string,
    expenseCents: number,
    incomeCents: number,
  ) => {
    const current = sums.get(accountId) ?? { debit: 0, credit: 0 };
    current.debit += expenseCents;
    current.credit += incomeCents;
    sums.set(accountId, current);
  };
  for (const entry of entries) {
    const share = shareOf(entry);
    if (share === 0) continue;
    const value = entryValueCents(entry.lines);
    const flows = entry.lines
      .map((line) => ({ line, cents: lineFlowCents(line) }))
      .filter((f) => f.cents !== 0);
    const attributed = flows.map((f) => ({
      ...f,
      cents: value === 0 ? 0 : Math.round((f.cents * share) / value),
    }));
    // The attribution invariant: Σ expense attributed − Σ income attributed
    // equals the entry's share of the entry's value. Any per-line rounding
    // drift is absorbed by the entry's dominant line so it holds exactly.
    const net = attributed.reduce(
      (acc, f) => acc + (f.line.account.type === "income" ? -f.cents : f.cents),
      0,
    );
    const drift = share - net;
    if (drift !== 0 && attributed.length > 0) {
      const dominant = attributed.reduce((a, b) =>
        Math.abs(a.cents) >= Math.abs(b.cents) ? a : b,
      );
      dominant.cents += drift;
    }
    for (const f of attributed) {
      if (f.line.account.type === "income") {
        add(f.line.accountId, 0, f.cents);
      } else {
        add(f.line.accountId, f.cents, 0);
      }
    }
  }
  // Cents → yuan (integer cents, exact).
  for (const [accountId, s] of sums) {
    sums.set(accountId, {
      debit: s.debit / 100,
      credit: s.credit / 100,
    });
  }
  return sums;
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

/**
 * Ledger-wide P&L, share-based: the viewer's actual spending. Each entry
 * counts at the viewer's participant share (equal split of expense −
 * income across the tagged set; guest-created entries count through the
 * viewer's share), and the viewer's own untagged entries count in full.
 * The viewer's own opt-outs (countsInLedger=false) stay out — they were
 * already expensed elsewhere. Accounting-truth views (trial balance, net
 * worth) remain gross.
 */
export async function incomeStatement(
  userId: string,
  ledgerId: string,
  window: { from?: Date; to?: Date } = {},
) {
  const [accounts, entries] = await Promise.all([
    accountRepository.listByLedger(ledgerId),
    journalRepository.listShareEntries(ledgerId, userId, window),
  ]);
  return buildStatementRows(
    accounts,
    shareSumsByAccount(entries, (entry) => viewerShareCents(entry, userId)),
  );
}

/**
 * Per-user turnover: the gross amount (total debits) of every entry a
 * user is tagged on, summed over the window. An entry tagged with several
 * users counts in full for each of them — "related turnover", not a split
 * (amount splits live in the journal lines). The output is keyed by user
 * (one row per user with turnover in the window); current members with no
 * tagged entries are omitted (zero turnover), so a user with rows is
 * always a member of this ledger. Departed members with historical tags
 * keep their row alongside current ones — their participation in past
 * entries is a fact the owner still wants to see.
 */
export async function memberTurnover(
  ledgerId: string,
  window: { from?: Date; to?: Date } = {},
) {
  const [members, projectUsers, tagged] = await Promise.all([
    ledgerMemberRepository.listByLedger(ledgerId),
    projectMemberRepository.listUsersInLedger(ledgerId),
    journalRepository.listTaggedEntries(ledgerId, window),
  ]);

  const memberByUserId = new Map(members.map((m) => [m.userId, m]));
  // Project outsiders hold no ledger row — their identity comes from the
  // project membership's User.
  const projectUserByUserId = new Map(projectUsers.map((p) => [p.userId, p]));

  const turnoverByUserId = new Map<
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
      const current = turnoverByUserId.get(participant.userId) ?? {
        turnover: 0,
        entries: 0,
      };
      current.turnover += gross;
      current.entries += 1;
      turnoverByUserId.set(participant.userId, current);
    }
  }

  const rows = [...turnoverByUserId.entries()].map(([userId, agg]) => {
    const member = memberByUserId.get(userId);
    const projectUser = projectUserByUserId.get(userId);
    return {
      // Forward the userId so the client can disambiguate a row even when
      // the user is no longer a current ledger member.
      userId,
      ledgerMemberId: member?.id ?? null,
      name: member?.user?.name ?? projectUser?.user?.name ?? userId,
      avatar: member?.user?.avatar ?? projectUser?.user?.avatar ?? null,
      // Project outsiders aren't ledger members — the guest role is what
      // their participation maps to.
      role: (member?.role ?? "guest") as LedgerRole,
      entryCount: agg.entries,
      turnover: round(agg.turnover),
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

  const accounts = await accountRepository.listByLedger(ledgerId);
  const [allTimeSums, monthEntries, members, recentEntries] = await Promise.all(
    [
      // Net worth stays accounting-true — the money really moved.
      sumsByAccount(ledgerId),
      // Behavioral month statement: the ledger members' actual shares. Each
      // entry splits across its participant set and only the members' slices
      // sum in — project outsiders (no roster row) drop out of the split, so
      // the family's income/expense stops absorbing their spending, while
      // pure member entries still count in full. Visibility mirrors the
      // journal list: guest posts stay counted even when opted out; only
      // non-guest opt-outs drop.
      journalRepository.listActivityEntries(ledgerId, {
        from: monthStart,
        to: monthEnd,
      }),
      ledgerMemberRepository.listByLedger(ledgerId),
      journalRepository.listRecent(ledgerId, 5),
    ],
  );
  const memberUserIds = new Set(members.map((m) => m.userId));

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

  const statement = buildStatementRows(
    accounts,
    shareSumsByAccount(monthEntries, (entry) =>
      memberSharesCents(entry, memberUserIds),
    ),
  );

  // Recent entries mirror the journal activity: member entries the creator
  // kept in plus every guest post (every entry feeding the statement stays
  // visible at the top of the dashboard too).
  return {
    assets: round(assets),
    liabilities: round(liabilities),
    netWorth: round(assets - liabilities),
    month: {
      year: monthStart.getUTCFullYear(),
      month: monthStart.getUTCMonth() + 1,
      ...statement,
    },
    recentEntries: recentEntries.map((e) =>
      redactEntryCreatorEmail(e, viewerRole),
    ),
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
