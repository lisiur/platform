import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { assertLedgerWritable } from "./access";
import { accountRepository } from "./account.repository";
import { budgetRepository } from "./budget.repository";
import { journalRepository } from "./journal.repository";
import { ledgerRepository } from "./ledger.repository";

/**
 * Monthly discretionary budget for a ledger, organized PER YEAR — the math
 * behind the budget card and the year-to-date aggregate. Everything that
 * decides numbers is a pure function below (unit-tested in
 * budget.service.test.ts); the orchestration only fetches and delegates.
 *
 * A year carries one monthly amount (LedgerBudgetYear) that applies to
 * EVERY month of that year — including already-recorded ones, which is
 * what makes mid-year adoption retroactive — plus optional single-month
 * overrides (LedgerBudgetMonthOverride). A month's effective budget is
 * its override ?? the year amount; there is no per-month delete, closing
 * the year row is the only off-switch. Two pools per month:
 * `countedCents` (expense value the budget answers for) and
 * `excludedCents` (planned big charges marked "excluded from budget" at
 * posting time). Only ledger-activity entries feed the pools — a
 * countsInLedger opt-out (a repayment already expensed at purchase) is not
 * new spending. Income and transfers never count.
 */

/** Per-entry budget input produced by `journalRepository.listBudgetActivity`. */
export interface BudgetActivityRow {
  date: Date;
  /** The entry's expense-line debit − credit sum in cents (≥ 0). */
  expenseCents: number;
  /** The `expenseCents` portion posted with excludedFromBudget = true. */
  excludedCents: number;
}

export interface BudgetMonthAggregate {
  countedCents: number;
  excludedCents: number;
}

export interface BudgetYearRow {
  year: number;
  month: number;
  budgetCents: number;
  countedCents: number;
  diffCents: number;
}

export interface BudgetYear {
  startYear: number;
  startMonth: number;
  rows: BudgetYearRow[];
  netCents: number;
}

/**
 * [from, to] of a natural month under a FIXED UTC offset (minutes east of
 * UTC, ISO style — so UTC+8 sends 480). Explicit numbers instead of
 * from/to instants because the aggregate buckets by month and an instant
 * parsed in UTC re-introduces the dashboard's UTC-month mislabel for
 * timezones east of UTC. DST is not modeled: one offset per request, the
 * client's current one — entries recorded across a DST shift can
 * mis-bucket by an hour, which is nothing against a monthly budget.
 */
export function monthWindow(
  year: number,
  month: number,
  tzOffsetMinutes: number,
): { from: Date; to: Date } {
  const offsetMs = tzOffsetMinutes * 60_000;
  // Date.UTC rolls month 12 into next January, so December's "next month
  // start" needs no special case.
  const from = new Date(Date.UTC(year, month - 1, 1) - offsetMs);
  const to = new Date(Date.UTC(year, month, 1) - offsetMs - 1);
  return { from, to };
}

/** Calendar year of an instant under a fixed UTC offset. */
export function yearIndexOf(date: Date, tzOffsetMinutes: number): number {
  return new Date(date.getTime() + tzOffsetMinutes * 60_000).getUTCFullYear();
}

/** Calendar month (1..12) of an instant under a fixed UTC offset. */
export function monthIndexOf(date: Date, tzOffsetMinutes: number): number {
  return new Date(date.getTime() + tzOffsetMinutes * 60_000).getUTCMonth() + 1;
}

/**
 * Buckets a year's budget activity by month. Every month with at least one
 * activity entry gets a bucket — including months whose spending is all
 * excluded (their counted pool is 0, so they resolve to a surplus), which
 * is what "已记账月份" means for the yearly aggregate.
 */
export function aggregateBudgetMonths(
  activity: BudgetActivityRow[],
  tzOffsetMinutes: number,
  anchorYear: number,
): Map<number, BudgetMonthAggregate> {
  const byMonth = new Map<number, BudgetMonthAggregate>();
  for (const row of activity) {
    if (yearIndexOf(row.date, tzOffsetMinutes) !== anchorYear) continue;
    const month = monthIndexOf(row.date, tzOffsetMinutes);
    const aggregate = byMonth.get(month) ?? {
      countedCents: 0,
      excludedCents: 0,
    };
    aggregate.countedCents += row.expenseCents - row.excludedCents;
    aggregate.excludedCents += row.excludedCents;
    byMonth.set(month, aggregate);
  }
  return byMonth;
}

/** The earliest activity month (1..12) of the anchor year, if any. */
export function firstActivityMonth(
  activity: BudgetActivityRow[],
  tzOffsetMinutes: number,
  anchorYear: number,
): number | null {
  let first: number | null = null;
  for (const row of activity) {
    if (yearIndexOf(row.date, tzOffsetMinutes) !== anchorYear) continue;
    const month = monthIndexOf(row.date, tzOffsetMinutes);
    if (first === null || month < first) first = month;
  }
  return first;
}

/**
 * A month's effective budget: its own override when one is pinned, else
 * the year's monthly amount. Null only when the year has no budget row —
 * there is deliberately no per-month "unset".
 */
export function resolveMonthBudgetCents(
  yearCents: number,
  overrides: ReadonlyMap<number, number>,
  month: number,
): number;
export function resolveMonthBudgetCents(
  yearCents: number | null,
  overrides: ReadonlyMap<number, number>,
  month: number,
): number | null;
export function resolveMonthBudgetCents(
  yearCents: number | null,
  overrides: ReadonlyMap<number, number>,
  month: number,
): number | null {
  return overrides.get(month) ?? yearCents;
}

/**
 * The year-to-date table behind the budget card's "今年累计" line: from the
 * year's first recorded month through the month before the anchor (the
 * current month never participates), each recorded month's
 * `countedCents − budgetCents` — positives (overspend) and negatives
 * (surplus) cancel out. The year amount covers every recorded month,
 * including ones that predate the budget's adoption (mid-year adoption).
 * Null when the year has no recorded activity or no budget row.
 */
export function buildBudgetYear(
  activity: BudgetActivityRow[],
  yearCents: number | null,
  overrides: ReadonlyMap<number, number>,
  anchorYear: number,
  anchorMonth: number,
  tzOffsetMinutes: number,
): BudgetYear | null {
  if (yearCents === null) return null;
  const firstMonth = firstActivityMonth(activity, tzOffsetMinutes, anchorYear);
  if (firstMonth === null) return null;
  const aggregates = aggregateBudgetMonths(
    activity,
    tzOffsetMinutes,
    anchorYear,
  );
  const rows: BudgetYearRow[] = [];
  let netCents = 0;
  for (let month = firstMonth; month < anchorMonth; month += 1) {
    const aggregate = aggregates.get(month);
    // 未记账且未设预算的月份不参与 — a month without activity rows stays out.
    if (!aggregate) continue;
    const budgetCents = resolveMonthBudgetCents(yearCents, overrides, month);
    const diffCents = aggregate.countedCents - budgetCents;
    rows.push({
      year: anchorYear,
      month,
      budgetCents,
      countedCents: aggregate.countedCents,
      diffCents,
    });
    netCents += diffCents;
  }
  return { startYear: anchorYear, startMonth: firstMonth, rows, netCents };
}

/** Raw activity rows → budget inputs (cents via the same rounding as the
 *  share math: Math.round(Number(decimal) * 100)). Income/transfer entries
 *  come through with zero expense cents — they still mark their month as
 *  recorded. */
export function toBudgetActivityRows(
  entries: Array<{
    date: Date;
    excludedFromBudget: boolean;
    lines: Array<{
      debit: Prisma.Decimal | number;
      credit: Prisma.Decimal | number;
      account: { type: string };
    }>;
  }>,
): BudgetActivityRow[] {
  return entries.map((entry) => {
    let expenseCents = 0;
    for (const line of entry.lines) {
      if (line.account.type !== "expense") continue;
      expenseCents +=
        Math.round(Number(line.debit) * 100) -
        Math.round(Number(line.credit) * 100);
    }
    return {
      date: entry.date,
      expenseCents,
      excludedCents: entry.excludedFromBudget ? expenseCents : 0,
    };
  });
}

export interface BudgetSettings {
  /** The year these settings describe. */
  year: number;
  /** The year's monthly budget; null = no budget for this year (the card
   *  and the year table hide everywhere until one is set). */
  cents: number | null;
  /** The previous year's amount — the settings form's prefill so a new
   *  year starts where the last one left off (saving is what makes it
   *  real). Null when the previous year had none. */
  carryOverCents: number | null;
  /** Single-month overrides, month-ascending — only the pinned months. */
  months: Array<{ month: number; cents: number }>;
  excludedAccountIds: string[];
}

/** The ledger (404 on absence). */
async function requireLedger(ledgerId: string) {
  const ledger = await ledgerRepository.findById(ledgerId);
  if (!ledger) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  return ledger;
}

/** Reads the settings for an already-loaded ledger — every caller holds the
 *  ledger from requireLedger (for the 404 / the write floor), so the read
 *  never fetches it a second time. */
async function loadSettings(
  ledger: { id: string; budgetExcludedAccountIds: string[] },
  year: number,
): Promise<BudgetSettings> {
  const [yearRow, previousYear] = await Promise.all([
    budgetRepository.findYear(ledger.id, year),
    budgetRepository.findYear(ledger.id, year - 1),
  ]);
  return {
    year,
    cents: yearRow?.cents ?? null,
    carryOverCents: previousYear?.cents ?? null,
    months: (yearRow?.months ?? []).map((override) => ({
      month: override.month,
      cents: override.cents,
    })),
    excludedAccountIds: ledger.budgetExcludedAccountIds,
  };
}

export async function getBudgetSettings(
  ledgerId: string,
  year: number,
): Promise<BudgetSettings> {
  return loadSettings(await requireLedger(ledgerId), year);
}

/**
 * Sets (or re-sets) the year's monthly budget — upserting the year row.
 * The amount covers every month of the year, so adopting a budget
 * mid-year retroactively budgets the already-recorded months.
 */
export async function setYearBudget(
  ledgerId: string,
  year: number,
  cents: number,
): Promise<BudgetSettings> {
  const ledger = await requireLedger(ledgerId);
  assertLedgerWritable(ledger);
  await budgetRepository.upsertYear(ledgerId, { year, cents });
  return loadSettings(ledger, year);
}

/**
 * Pins a single month to its own amount (upsert; no per-month delete —
 * re-adjusting to another amount, including the year's default, is the
 * only change path). Requires the year budget to exist: an override
 * without a year amount would make "this month has a budget but the year
 * doesn't" a state nothing else handles.
 */
export async function setMonthBudget(
  ledgerId: string,
  year: number,
  month: number,
  cents: number,
): Promise<BudgetSettings> {
  const ledger = await requireLedger(ledgerId);
  assertLedgerWritable(ledger);
  const yearRow = await budgetRepository.findYear(ledgerId, year);
  if (!yearRow) {
    throw new HTTPException(400, {
      message: "Set the year's monthly budget before adjusting single months",
    });
  }
  await budgetRepository.upsertMonthOverride(yearRow.id, { month, cents });
  return loadSettings(ledger, year);
}

/**
 * Closes the year: the year row and, through the cascade, every single-
 * month override disappear — the only deletion the budget has. Surfaces
 * re-read settings to render the cleared state.
 */
export async function closeYearBudget(
  ledgerId: string,
  year: number,
): Promise<BudgetSettings> {
  const ledger = await requireLedger(ledgerId);
  assertLedgerWritable(ledger);
  await budgetRepository.deleteYear(ledgerId, year);
  return loadSettings(ledger, year);
}

/**
 * Replaces the budget-excluded category list (top-level expense category
 * ids the quick entry defaults to "exclude from budget"). Year-independent
 * — it shapes how future entries post, never rewrites stored ones.
 */
export async function setExcludedCategories(
  ledgerId: string,
  year: number,
  excludedAccountIds: string[],
): Promise<BudgetSettings> {
  const ledger = await requireLedger(ledgerId);
  assertLedgerWritable(ledger);
  const ids = [...new Set(excludedAccountIds)];
  const accounts = await accountRepository.listByLedger(ledgerId);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const id of ids) {
    const account = byId.get(id);
    if (account?.type !== "expense") {
      throw new HTTPException(400, {
        message:
          "Excluded categories must be expense categories of this ledger",
      });
    }
  }
  await budgetRepository.setExcludedAccountIds(ledgerId, ids);
  return loadSettings(ledger, year);
}

/**
 * The budget card's payload: the anchor month's effective budget and two
 * pools plus the year-to-date table (nulls when the year has no budget —
 * clients hide every budget surface then; excludedAccountIds still ride
 * along so quick entry can resolve the toggle's default from the
 * exclusion list).
 */
export async function buildBudgetReport(
  ledgerId: string,
  year: number,
  month: number,
  tzOffsetMinutes: number,
) {
  const ledger = await requireLedger(ledgerId);
  const anchorWindow = monthWindow(year, month, tzOffsetMinutes);
  const yearWindow = {
    from: monthWindow(year, 1, tzOffsetMinutes).from,
    to: anchorWindow.to,
  };
  const [yearRow, rawActivity] = await Promise.all([
    budgetRepository.findYear(ledgerId, year),
    journalRepository.listBudgetActivity(ledgerId, yearWindow),
  ]);
  const activity = toBudgetActivityRows(rawActivity);
  const aggregates = aggregateBudgetMonths(activity, tzOffsetMinutes, year);
  const overrides = new Map(
    (yearRow?.months ?? []).map((override) => [override.month, override.cents]),
  );
  const yearCents = yearRow?.cents ?? null;
  const anchorAggregate = aggregates.get(month);
  return {
    budgetCents: yearCents,
    currency: ledger.currency,
    excludedAccountIds: ledger.budgetExcludedAccountIds,
    month:
      yearCents === null
        ? null
        : {
            year,
            month,
            budgetCents: resolveMonthBudgetCents(yearCents, overrides, month),
            countedCents: anchorAggregate?.countedCents ?? 0,
            excludedCents: anchorAggregate?.excludedCents ?? 0,
          },
    year:
      yearCents === null
        ? null
        : buildBudgetYear(
            activity,
            yearCents,
            overrides,
            year,
            month,
            tzOffsetMinutes,
          ),
  };
}
