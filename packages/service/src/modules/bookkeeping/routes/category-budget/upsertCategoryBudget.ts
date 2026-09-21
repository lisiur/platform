import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { upsertCategoryBudget } from "../../category-budget.service";
import {
  categoryBudgetSettingsSchema,
  ledgerIdParamSchema,
  upsertCategoryBudgetBodySchema,
} from "./schema";

export const upsertCategoryBudgetRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "upsertQianlaiCategoryBudget",
    method: "put",
    path: "/ledgers/{ledgerId}/category-budgets",
    tags: ["QianlaiCategoryBudget"],
    summary:
      "Pin (or re-pin) one category's whole-year budget — ledger-wide shared state, editor floor",
    description:
      "Upserts the (year, category) row. The category must be an expense category of this ledger, any depth; parent and child rows may coexist and their spent totals intentionally overlap (each rolls up its subtree). The amount covers the whole year including already-recorded months. Returns the fresh settings so the client needs no reload round-trip.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: upsertCategoryBudgetBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(categoryBudgetSettingsSchema, "The updated settings"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year, accountId, cents } = c.req.valid("json");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const settings = await upsertCategoryBudget(
      ledgerId,
      year,
      accountId,
      cents,
    );
    return c.json(settings, 200);
  },
});
