import { z } from "@hono/zod-openapi";
import {
  ACCOUNT_TYPES,
  ENTRY_KINDS,
  LEDGER_ROLES,
  STAT_SHARE_MODES,
} from "../../domain";
import { journalEntrySchema } from "../journal-entry/schema";

export const trialBalanceRowSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().openapi({ example: null }),
    code: z.string().nullable().openapi({ example: "cash" }),
    type: z.enum(ACCOUNT_TYPES),
    sortOrder: z.number().int().openapi({ example: 10 }),
    totalDebit: z.number().openapi({ example: 100 }),
    totalCredit: z.number().openapi({ example: 0 }),
    balance: z.number().openapi({ example: 100 }),
  })
  .openapi("QianlaiTrialBalanceRow");

export const trialBalanceResponseSchema = z
  .object({
    accounts: trialBalanceRowSchema.array(),
    totals: z
      .object({
        debit: z.number().openapi({ example: 100 }),
        credit: z.number().openapi({ example: 100 }),
      })
      .openapi("QianlaiTrialBalanceTotals"),
  })
  .openapi("QianlaiTrialBalanceResponse");

const statementRowSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().openapi({ example: null }),
    code: z.string().nullable().openapi({ example: "salary" }),
    type: z.enum(ACCOUNT_TYPES),
    sortOrder: z.number().int().openapi({ example: 70 }),
    balance: z.number().openapi({ example: 8000 }),
  })
  .openapi("QianlaiStatementRow");

export const incomeStatementResponseSchema = z
  .object({
    income: statementRowSchema.array(),
    expense: statementRowSchema.array(),
    totalIncome: z.number().openapi({ example: 8000 }),
    totalExpense: z.number().openapi({ example: 3500 }),
    net: z.number().openapi({ example: 4500 }),
  })
  .openapi("QianlaiIncomeStatementResponse");

export const dashboardResponseSchema = z
  .object({
    assets: z.number().openapi({ example: 50000 }),
    liabilities: z.number().openapi({ example: 3000 }),
    netWorth: z.number().openapi({ example: 47000 }),
    month: z
      .object({
        year: z.number().int().openapi({ example: 2026 }),
        month: z.number().int().openapi({ example: 8 }),
        income: statementRowSchema.array(),
        expense: statementRowSchema.array(),
        totalIncome: z.number().openapi({ example: 8000 }),
        totalExpense: z.number().openapi({ example: 3500 }),
        net: z.number().openapi({ example: 4500 }),
      })
      .openapi("QianlaiDashboardMonth"),
    recentEntries: journalEntrySchema.array(),
  })
  .openapi("QianlaiDashboardResponse");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const dashboardQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .openapi("QianlaiDashboardQuery");

export const incomeStatementQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .openapi("QianlaiIncomeStatementQuery");

export const trialBalanceQuerySchema = z
  .object({
    to: z.coerce.date().optional(),
  })
  .openapi("QianlaiTrialBalanceQuery");

export const memberTurnoverRowSchema = z
  .object({
    // Primary key of the row: the user (a departed member with historical
    // tags still gets a row even though their LedgerMember row is gone).
    userId: z.string(),
    // Null when the user is no longer a current member of this ledger.
    ledgerMemberId: z.string().nullable(),
    name: z.string(),
    avatar: z.string().nullable(),
    role: z.enum(LEDGER_ROLES),
    entryCount: z.number().int().openapi({ example: 12 }),
    turnover: z.number().openapi({ example: 3250.5 }),
  })
  .openapi("QianlaiMemberTurnoverRow");

export const memberTurnoverResponseSchema = z
  .object({
    members: memberTurnoverRowSchema.array(),
    totals: z
      .object({
        entries: z.number().int().openapi({ example: 18 }),
        turnover: z.number().openapi({ example: 5180.75 }),
      })
      .openapi("QianlaiMemberTurnoverTotals"),
  })
  .openapi("QianlaiMemberTurnoverResponse");

export const memberTurnoverQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .openapi("QianlaiMemberTurnoverQuery");

export const dailySummaryRowSchema = z
  .object({
    // The LOCAL calendar day "yyyy-MM-dd" under the request's
    // tzOffsetMinutes — clients key their day groups on the string and
    // never re-parse it into a UTC instant.
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .openapi({ example: "2026-09-17" }),
    incomeCents: z.number().int().openapi({ example: 5000 }),
    expenseCents: z.number().int().openapi({ example: 12000 }),
  })
  .openapi("QianlaiDailySummaryRow");

export const dailySummaryResponseSchema = z
  .object({
    days: dailySummaryRowSchema.array(),
  })
  .openapi("QianlaiDailySummaryResponse");

// The journal list's filter surface minus list mechanics (pagination,
// ordering) — these summaries are stats, and stats honor the activity
// predicate's defaults plus three caller-controlled flags:
//   - shareMode (REQUIRED): the aggregation's numerator. "members" splits
//     each entry across its participant set and counts only the ledger
//     members' slices, so the result is the family's actual spend (the
//     figure the dashboard's stat card summarizes). "line" sums raw
//     journal lines (the income statement's semantics) — every debit/
//     credit counts, project outsiders included. Required because every
//     caller must declare its scope's contract; iOS picks members in
//     ledger scope and line in project scope, so the dashboard charts
//     and the stat card reconcile in one scope, and the project's books
//     stay raw in the other.
//   - includeExcluded (default false): whether to also return entries
//     the creator opted out of the ledger's surfaces (countsInLedger =
//     false). When false, the ledger-activity predicate scopes the entry
//     set (members' kept-in entries + guest posts). When true, every
//     entry of the ledger passes through, like the journal list does
//     with its own includeExcluded flag.
//   - includeBudgetExcluded (default true): whether to include entries
//     the per-entry budget flag (excludedFromBudget) marks off. The
//     ledger's bookkeeping views default to including them (a top-up
//     card payment kept out of budget still spent real money this month);
//     budget-only callers flip this false. Distinct from the activity
//     predicate — that one targets the creator's opt-out, this one
//     targets the budget opt-out.
const statFilterFields = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().optional(),
  participantUserId: z.string().optional(),
  projectId: z.string().optional(),
  accountId: z.string().optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  kind: z.enum(ENTRY_KINDS).optional(),
  memberUserId: z.string().optional(),
};

const statViewFields = {
  shareMode: z.enum(STAT_SHARE_MODES).openapi({
    description:
      'The aggregation\'s numerator. "members" splits each entry across its participant set and counts only the ledger members\' slices (the dashboard stat card\'s figure); "line" sums raw journal lines.',
  }),
  // Boolean query flags follow the journal list's includeExcluded idiom —
  // an explicit "true"/"false" enum, never boolean coercion (query strings
  // coerce "false" to true). Absent means the documented default.
  includeExcluded: z.enum(["true", "false"]).optional().openapi({
    description:
      "Also return entries the creator opted out of the ledger's surfaces (countsInLedger=false). Default false — the ledger-activity predicate scopes the entry set.",
  }),
  includeBudgetExcluded: z.enum(["true", "false"]).optional().openapi({
    description:
      "Include entries the per-entry budget flag marks off (excludedFromBudget=true). Default true — bookkeeping views don't drop budget opt-outs.",
  }),
};

/** The two view flags resolved to booleans with their defaults applied —
 *  the one place both stat handlers turn the wire's "true"/"false" strings
 *  into flags (includeExcluded off, includeBudgetExcluded on when absent),
 *  so the defaults can't drift between the endpoints. */
export function statViewFlags(query: {
  includeExcluded?: "true" | "false";
  includeBudgetExcluded?: "true" | "false";
}) {
  return {
    includeExcluded: query.includeExcluded === "true",
    includeBudgetExcluded: query.includeBudgetExcluded !== "false",
  };
}

export const dailySummaryQuerySchema = z
  .object({
    ...statFilterFields,
    ...statViewFields,
    tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .openapi("QianlaiDailySummaryQuery");

export const categoryAmountRowSchema = z
  .object({
    accountId: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().nullable().openapi({ example: null }),
    code: z.string().nullable().openapi({ example: "food" }),
    parentName: z.string().nullable().openapi({ example: null }),
    parentCode: z.string().nullable().openapi({ example: "food" }),
    parentAccountId: z.string().nullable().openapi({
      example: null,
      description:
        "The parent account's id when the category sits under one — the key for the list endpoint's parentAccountId rollup drill-down.",
    }),
    parentIcon: z.string().nullable().openapi({
      example: null,
      description:
        "The parent account's own icon — the composition rollup badge's primary source (a top-level category renders its own glyph, not a child's).",
    }),
    icon: z.string().nullable().openapi({
      example: null,
      description:
        "Emoji or icon name for the leaf account, surfaced as the legend row badge. The rollup badge falls back to the first leaf's icon when the parent carries none.",
    }),
    amountCents: z.number().int().openapi({ example: 12000 }),
  })
  .openapi("QianlaiCategoryAmountRow");

export const categorySummaryResponseSchema = z
  .object({
    expense: categoryAmountRowSchema.array(),
    income: categoryAmountRowSchema.array(),
  })
  .openapi("QianlaiCategorySummaryResponse");

export const categorySummaryQuerySchema = z
  .object({
    ...statFilterFields,
    ...statViewFields,
  })
  .openapi("QianlaiCategorySummaryQuery");
