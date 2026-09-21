import { HTTPException } from "hono/http-exception";
import { assertLedgerWritable } from "./access";
import { accountRepository } from "./account.repository";
import { monthWindow } from "./budget.service";
import { categoryBudgetRepository } from "./category-budget.repository";
import { journalRepository } from "./journal.repository";
import { ledgerRepository } from "./ledger.repository";

/**
 * Per-CATEGORY annual budgets, fully isolated from the year/month budget
 * (budget.service.ts): one row pins a whole-year cents amount to one
 * expense category. Everything that decides numbers is a pure function
 * below (unit-tested in category-budget.service.test.ts); orchestration
 * only fetches and delegates.
 *
 * "Spent" counts EVERY expense cent the ledger recorded in the year — the
 * flags never drop anything: `excludedFromBudget` stays in because the
 * report's window passes no budget-flag scoping, and `countsInLedger`
 * opt-outs stay in via `includeExcluded: true` — the same posture the
 * monthly budget's activity read takes. Parent and child rows may coexist;
 * each row's total rolls up its subtree (including itself), so a parent's
 * figure intentionally overlaps its children's.
 */

export interface CategoryBudgetAmount {
  accountId: string;
  cents: number;
}

export interface CategoryBudgetSettings {
  /** The year these settings describe. */
  year: number;
  /** The year's per-category budgets (account-id ascending). */
  categories: CategoryBudgetAmount[];
  /** The previous year's per-category amounts — the settings form's
   *  prefill so this year starts where the last one left off (saving is
   *  what makes it real). */
  carryOver: CategoryBudgetAmount[];
}

export interface CategoryBudgetReportRow {
  accountId: string;
  /** Display naming, mirroring the composition rows: seeded categories
   *  store name = null and clients render the localized label from code. */
  name: string | null;
  code: string | null;
  icon: string | null;
  budgetCents: number;
  spentCents: number;
}

export interface CategoryBudgetReport {
  year: number;
  currency: string;
  categories: CategoryBudgetReportRow[];
}

/** The minimal account shape the roll-up reads — the chart's tree edges. */
export interface RollUpAccount {
  id: string;
  parentId: string | null;
}

/**
 * Subtree-including-self roll-up: each budget row's spent total is its own
 * activity plus every descendant's, so lines posted directly on a
 * non-leaf category still count. Walks DOWN the tree per budget node with
 * a visited set — cycle-safe like BudgetMath.chain's leaf-up walk. Output
 * rows mirror `budgetAccountIds`' order 1:1; a budget id missing from the
 * chart (unreachable — the row cascades with its account) resolves its
 * own sum alone, and a zero-consumption category totals 0.
 */
export function rollUpCategorySums(
  accounts: readonly RollUpAccount[],
  sumsByAccountId: ReadonlyMap<string, number>,
  budgetAccountIds: readonly string[],
): Array<{ accountId: string; spentCents: number }> {
  const childrenByParent = new Map<string, string[]>();
  for (const account of accounts) {
    if (!account.parentId) continue;
    const siblings = childrenByParent.get(account.parentId);
    if (siblings) {
      siblings.push(account.id);
    } else {
      childrenByParent.set(account.parentId, [account.id]);
    }
  }
  const sumOf = (accountId: string) => sumsByAccountId.get(accountId) ?? 0;
  /** Own + descendants, the visited set cutting any data cycle. */
  const subtreeSum = (rootId: string): number => {
    let total = 0;
    const visited = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (!visited.has(id)) {
        visited.add(id);
        total += sumOf(id);
        for (const child of childrenByParent.get(id) ?? []) stack.push(child);
      }
    }
    return total;
  };
  return budgetAccountIds.map((accountId) => ({
    accountId,
    spentCents: subtreeSum(accountId),
  }));
}

/** The ledger (404 on absence). */
async function requireLedger(ledgerId: string) {
  const ledger = await ledgerRepository.findById(ledgerId);
  if (!ledger) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  return ledger;
}

/** The year's settings plus the previous year's amounts as prefill. */
async function loadSettings(
  ledgerId: string,
  year: number,
): Promise<CategoryBudgetSettings> {
  const [rows, previousRows] = await Promise.all([
    categoryBudgetRepository.listByYear(ledgerId, year),
    categoryBudgetRepository.listByYear(ledgerId, year - 1),
  ]);
  const toAmount = (row: { accountId: string; cents: number }) => ({
    accountId: row.accountId,
    cents: row.cents,
  });
  return {
    year,
    categories: rows.map(toAmount),
    carryOver: previousRows.map(toAmount),
  };
}

export async function getCategoryBudgets(
  ledgerId: string,
  year: number,
): Promise<CategoryBudgetSettings> {
  await requireLedger(ledgerId);
  return loadSettings(ledgerId, year);
}

/** Pins (or re-pins) one category's whole-year amount. The category must
 *  be an expense category of THIS ledger — any depth, like the exclusion
 *  list's validation. */
export async function upsertCategoryBudget(
  ledgerId: string,
  year: number,
  accountId: string,
  cents: number,
): Promise<CategoryBudgetSettings> {
  const ledger = await requireLedger(ledgerId);
  assertLedgerWritable(ledger);
  await assertExpenseCategory(ledgerId, accountId);
  await categoryBudgetRepository.upsert(ledgerId, {
    year,
    accountId,
    cents,
  });
  return loadSettings(ledgerId, year);
}

/** Removes one category's budget row — the settings page's swipe-to-delete.
 *  Idempotent: deleting an absent row still returns the fresh settings. */
export async function deleteCategoryBudget(
  ledgerId: string,
  year: number,
  accountId: string,
): Promise<CategoryBudgetSettings> {
  const ledger = await requireLedger(ledgerId);
  assertLedgerWritable(ledger);
  await categoryBudgetRepository.delete(ledgerId, { year, accountId });
  return loadSettings(ledgerId, year);
}

async function assertExpenseCategory(
  ledgerId: string,
  accountId: string,
): Promise<void> {
  const accounts = await accountRepository.listByLedger(ledgerId);
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (account?.type !== "expense") {
    throw new HTTPException(400, {
      message: "Budgeted categories must be expense categories of this ledger",
    });
  }
}

/**
 * The category budget card's payload: each budget row's whole-year cents
 * against the year's recorded spending. The year window spans the local
 * calendar year (January through December under the request's fixed UTC
 * offset); the aggregation reads the same category sums the composition
 * card does — with `includeExcluded: true` so the budget answers for
 * every recorded cent, matching the monthly budget's posture. Categories
 * come out in the chart's sortOrder order; a zero-consumption category
 * reports 0 spent.
 */
export async function buildCategoryBudgetReport(
  ledgerId: string,
  year: number,
  tzOffsetMinutes: number,
): Promise<CategoryBudgetReport> {
  const ledger = await requireLedger(ledgerId);
  const budgetRows = await categoryBudgetRepository.listByYear(ledgerId, year);
  if (budgetRows.length === 0) {
    return { year, currency: ledger.currency, categories: [] };
  }
  const window = {
    from: monthWindow(year, 1, tzOffsetMinutes).from,
    to: monthWindow(year, 12, tzOffsetMinutes).to,
  };
  const [accounts, summary] = await Promise.all([
    accountRepository.listByLedger(ledgerId),
    // includeExcluded: the default predicate drops the creator's
    // countsInLedger opt-outs, and the budget counts those too.
    journalRepository.sumLinesByCategory(ledgerId, {
      ...window,
      includeExcluded: true,
    }),
  ]);
  const sumsByAccountId = new Map(
    summary.expense.map((row) => [row.accountId, row.amountCents]),
  );
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const rollUp = rollUpCategorySums(
    accounts,
    sumsByAccountId,
    budgetRows.map((row) => row.accountId),
  );
  return {
    year,
    currency: ledger.currency,
    categories: rollUp
      .map((row) => {
        const account = byId.get(row.accountId);
        return {
          accountId: row.accountId,
          name: account?.name ?? null,
          code: account?.code ?? null,
          icon: account?.icon ?? null,
          budgetCents:
            budgetRows.find((budget) => budget.accountId === row.accountId)
              ?.cents ?? 0,
          spentCents: row.spentCents,
        };
      })
      .sort(
        (a, b) =>
          (byId.get(a.accountId)?.sortOrder ?? 0) -
          (byId.get(b.accountId)?.sortOrder ?? 0),
      ),
  };
}
