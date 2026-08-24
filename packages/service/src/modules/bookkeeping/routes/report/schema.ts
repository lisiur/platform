import { z } from "@hono/zod-openapi";
import { ACCOUNT_TYPES } from "../../domain";
import { journalEntrySchema } from "../journal-entry/schema";

export const trialBalanceRowSchema = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: "Cash" }),
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
    name: z.string().openapi({ example: "Salary" }),
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

export const incomeStatementQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .openapi("QianlaiIncomeStatementQuery");
