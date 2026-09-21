import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { getCategoryBudgets } from "../../category-budget.service";
import {
  categoryBudgetSettingsSchema,
  categoryBudgetYearQuerySchema,
  ledgerIdParamSchema,
} from "./schema";

export const getCategoryBudgetsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiCategoryBudgets",
    method: "get",
    path: "/ledgers/{ledgerId}/category-budgets",
    tags: ["QianlaiCategoryBudget"],
    summary: "The year's per-category budgets plus last year's prefill",
    description:
      "Read-only settings for the year: each budgeted category's whole-year amount (account-id ascending) and the previous year's amounts as the settings form's prefill. Fully isolated from the year/month budget — neither implies the other.",
    request: {
      params: ledgerIdParamSchema,
      query: categoryBudgetYearQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(categoryBudgetSettingsSchema, "The category budgets"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    const settings = await getCategoryBudgets(ledgerId, year);
    return c.json(settings, 200);
  },
});
