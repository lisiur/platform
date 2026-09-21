import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { deleteCategoryBudget } from "../../category-budget.service";
import {
  categoryBudgetSettingsSchema,
  deleteCategoryBudgetQuerySchema,
  ledgerIdParamSchema,
} from "./schema";

export const deleteCategoryBudgetRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiCategoryBudget",
    method: "delete",
    path: "/ledgers/{ledgerId}/category-budgets",
    tags: ["QianlaiCategoryBudget"],
    summary: "Remove one category's budget row — the settings page's delete",
    description:
      "Deletes the (year, category) row; idempotent. Rows also disappear when the category itself is deleted (cascade). Returns the fresh settings so the client needs no reload round-trip.",
    request: {
      params: ledgerIdParamSchema,
      query: deleteCategoryBudgetQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(categoryBudgetSettingsSchema, "The updated settings"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year, accountId } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const settings = await deleteCategoryBudget(ledgerId, year, accountId);
    return c.json(settings, 200);
  },
});
