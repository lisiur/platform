import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { buildCategoryBudgetReport } from "../../category-budget.service";
import {
  categoryBudgetReportQuerySchema,
  categoryBudgetReportResponseSchema,
  ledgerIdParamSchema,
} from "./schema";

export const getCategoryBudgetReportRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiCategoryBudgetReport",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/category-budgets",
    tags: ["QianlaiCategoryBudget"],
    summary:
      "The category budget card's numbers: each budgeted category's spent-vs-budget for the whole year",
    description:
      "One row per budgeted category: its whole-year budget against the recorded spending of its subtree (the category itself plus every descendant). Spent counts EVERY expense cent recorded in the year — entries the budget flag excludes and entries the creator opted out of the ledger (countsInLedger=false) stay in, the same posture the monthly budget takes. Rows come out in the chart's sort order; categories is empty when the year has no category budgets (the card hides then).",
    request: {
      params: ledgerIdParamSchema,
      query: categoryBudgetReportQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        categoryBudgetReportResponseSchema,
        "The category budget report",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year, tzOffsetMinutes } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    const report = await buildCategoryBudgetReport(
      ledgerId,
      year,
      tzOffsetMinutes,
    );
    return c.json(report, 200);
  },
});
