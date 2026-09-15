import { z } from "@hono/zod-openapi";
import { MAX_LINE_CENTS } from "../../domain";

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

/** Which year's budget the settings/report describe — the settings page
 *  edits the CURRENT year; there is no year switcher. */
export const budgetYearQuerySchema = z
  .object({
    year: z.coerce.number().int().openapi({ example: 2026 }),
  })
  .openapi("QianlaiBudgetYearQuery");

const budgetMonthOverrideSchema = z
  .object({
    month: z.number().int().min(1).max(12).openapi({ example: 12 }),
    cents: z
      .number()
      .int()
      .min(0)
      .max(MAX_LINE_CENTS)
      .openapi({ example: 800000 }),
  })
  .openapi("QianlaiBudgetMonthOverride");

export const budgetSettingsSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    // The year's monthly budget. Null = this year has no budget — clients
    // hide every budget surface (the card, the year aggregate) and never
    // nag. 0 is a valid (tight) budget.
    cents: z
      .number()
      .int()
      .min(0)
      .max(MAX_LINE_CENTS)
      .nullable()
      .openapi({ example: 500000 }),
    // The previous year's amount — a prefill hint for the settings form so
    // a new year starts where the last one left off (saving is what makes
    // it real). Null when the previous year had none.
    carryOverCents: z
      .number()
      .int()
      .min(0)
      .max(MAX_LINE_CENTS)
      .nullable()
      .openapi({ example: 500000 }),
    // Single-month overrides (month-ascending); only the pinned months.
    // No per-month delete exists — closing the year clears them all.
    months: budgetMonthOverrideSchema.array().openapi({ example: [] }),
    // Top-level expense category ids whose entries DEFAULT to "excluded
    // from budget" at posting time.
    excludedAccountIds: z.array(z.string()).openapi({ example: [] }),
  })
  .openapi("QianlaiBudgetSettings");

export const setYearBudgetBodySchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    // The year's monthly budget in cents — covers every month of the year,
    // including already-recorded ones (mid-year adoption is retroactive).
    cents: z
      .number()
      .int()
      .min(0)
      .max(MAX_LINE_CENTS)
      .openapi({ example: 500000 }),
  })
  .openapi("QianlaiSetYearBudgetBody");

export const setMonthBudgetBodySchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    month: z.number().int().min(1).max(12).openapi({ example: 12 }),
    // This month's own amount, deviating from the year's monthly value.
    // Upsert only — no per-month delete; closing the year clears it.
    cents: z
      .number()
      .int()
      .min(0)
      .max(MAX_LINE_CENTS)
      .openapi({ example: 800000 }),
  })
  .openapi("QianlaiSetMonthBudgetBody");

export const setExcludedCategoriesBodySchema = z
  .object({
    // Full replacement of the excluded top-level expense categories.
    excludedAccountIds: z.array(z.string().min(1)).openapi({ example: [] }),
  })
  .openapi("QianlaiSetExcludedCategoriesBody");

export const budgetMonthSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    month: z.number().int().min(1).max(12).openapi({ example: 9 }),
    budgetCents: z.number().int().openapi({
      example: 500000,
      description:
        "The month's effective budget: its override when pinned, else the year's monthly amount.",
    }),
    countedCents: z.number().int().openapi({
      example: 320000,
      description:
        "Expense value that counts against the budget (activity entries, excludedFromBudget = false).",
    }),
    excludedCents: z.number().int().openapi({
      example: 300000,
      description:
        "Expense value excluded from the budget at posting time; display-only.",
    }),
  })
  .openapi("QianlaiBudgetMonth");

export const budgetYearRowSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    month: z.number().int().min(1).max(12).openapi({ example: 8 }),
    budgetCents: z.number().int().openapi({ example: 500000 }),
    countedCents: z.number().int().openapi({ example: 550000 }),
    // counted − budget; positive overspend, negative surplus. Surpluses
    // cancel overspends in the net.
    diffCents: z.number().int().openapi({ example: 50000 }),
  })
  .openapi("QianlaiBudgetYearRow");

export const budgetYearSchema = z
  .object({
    // The year's first recorded month — the aggregate starts there, not at
    // January (mid-year adoption starts counting where the records start).
    startYear: z.number().int().openapi({ example: 2026 }),
    startMonth: z.number().int().min(1).max(12).openapi({ example: 6 }),
    rows: budgetYearRowSchema.array(),
    netCents: z.number().int().openapi({
      example: 80000,
      description:
        "Σ diffCents over the rows (the anchor month never participates).",
    }),
  })
  .openapi("QianlaiBudgetYear");

export const budgetReportQuerySchema = z
  .object({
    year: z.coerce.number().int().openapi({ example: 2026 }),
    month: z.coerce.number().int().min(1).max(12).openapi({
      example: 9,
      description:
        'The anchor month (the card\'s "this month"); the year aggregate runs to the month before it.',
    }),
    // Fixed UTC offset in minutes east of UTC, ISO style (so UTC+8 sends
    // 480). Explicit numbers instead of from/to instants: the aggregate
    // buckets by natural month, and instants parsed in UTC re-introduce the
    // UTC-month mislabel for timezones east of UTC. DST is not modeled.
    tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .openapi("QianlaiBudgetReportQuery");

export const budgetReportResponseSchema = z
  .object({
    // The anchor year's monthly budget; null = no budget for this year.
    budgetCents: z
      .number()
      .int()
      .min(0)
      .max(MAX_LINE_CENTS)
      .nullable()
      .openapi({ example: 500000 }),
    currency: z.string().openapi({ example: "CNY" }),
    excludedAccountIds: z.array(z.string()).openapi({ example: [] }),
    // Null when no budget is set — the card hides entirely then.
    month: budgetMonthSchema.nullable(),
    year: budgetYearSchema.nullable(),
  })
  .openapi("QianlaiBudgetReportResponse");
