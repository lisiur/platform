import { z } from "@hono/zod-openapi";
import { MAX_INT_CENTS } from "../../domain";

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

/** Which year's category budgets the settings/report describe — the
 *  settings page edits the CURRENT year; there is no year switcher. */
export const categoryBudgetYearQuerySchema = z
  .object({
    year: z.coerce.number().int().openapi({ example: 2026 }),
  })
  .openapi("QianlaiCategoryBudgetYearQuery");

export const categoryBudgetAmountSchema = z
  .object({
    accountId: z.string().min(1).openapi({ example: "clxacc123456789" }),
    cents: z
      .number()
      .int()
      .min(0)
      .max(MAX_INT_CENTS)
      .openapi({ example: 1200000 }),
  })
  .openapi("QianlaiCategoryBudgetAmount");

export const categoryBudgetSettingsSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    // The year's per-category budgets, account-id ascending.
    categories: categoryBudgetAmountSchema.array().openapi({ example: [] }),
    // The previous year's per-category amounts — a prefill hint for the
    // settings form so this year starts where the last one left off.
    carryOver: categoryBudgetAmountSchema.array().openapi({ example: [] }),
  })
  .openapi("QianlaiCategoryBudgetSettings");

export const upsertCategoryBudgetBodySchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    // The budgeted expense category (any depth). Parent and child rows may
    // coexist — each row's spent total rolls up its subtree.
    accountId: z.string().min(1).openapi({ example: "clxacc123456789" }),
    // The category's whole-year budget in cents (0 is a valid budget).
    cents: z
      .number()
      .int()
      .min(0)
      .max(MAX_INT_CENTS)
      .openapi({ example: 1200000 }),
  })
  .openapi("QianlaiUpsertCategoryBudgetBody");

export const deleteCategoryBudgetQuerySchema = z
  .object({
    year: z.coerce.number().int().openapi({ example: 2026 }),
    accountId: z.string().min(1).openapi({ example: "clxacc123456789" }),
  })
  .openapi("QianlaiDeleteCategoryBudgetQuery");

export const categoryBudgetReportQuerySchema = z
  .object({
    year: z.coerce.number().int().openapi({ example: 2026 }),
    // Fixed UTC offset in minutes east of UTC, ISO style (so UTC+8 sends
    // 480) — the budget report's contract. The year window spans the
    // offset's calendar year.
    tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .openapi("QianlaiCategoryBudgetReportQuery");

export const categoryBudgetReportRowSchema = z
  .object({
    accountId: z.string().min(1).openapi({ example: "clxacc123456789" }),
    // Display naming, mirroring the composition rows: seeded categories
    // store name = null and clients render the localized label from code.
    name: z.string().nullable().openapi({ example: "餐饮" }),
    code: z.string().nullable().openapi({ example: "food" }),
    icon: z.string().nullable().openapi({ example: "🍜" }),
    budgetCents: z.number().int().openapi({ example: 1200000 }),
    spentCents: z.number().int().openapi({
      example: 980000,
      description:
        "The category subtree's recorded expense for the whole year — counts every entry, including the budget-excluded flag and countsInLedger opt-outs.",
    }),
  })
  .openapi("QianlaiCategoryBudgetReportRow");

export const categoryBudgetReportResponseSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    currency: z.string().openapi({ example: "CNY" }),
    // Empty when the year has no category budgets — the card hides then.
    categories: categoryBudgetReportRowSchema.array(),
  })
  .openapi("QianlaiCategoryBudgetReportResponse");
