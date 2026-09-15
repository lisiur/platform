import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { closeYearBudget } from "../../budget.service";
import {
  budgetSettingsSchema,
  budgetYearQuerySchema,
  ledgerIdParamSchema,
} from "./schema";

export const closeYearBudgetRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "closeQianlaiYearBudget",
    method: "delete",
    path: "/ledgers/{ledgerId}/budget",
    tags: ["QianlaiBudget"],
    summary:
      "Close the year's budget — the only deletion; the year row and every single-month override go away",
    request: {
      params: ledgerIdParamSchema,
      query: budgetYearQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        budgetSettingsSchema,
        "The settings after the close (cents null)",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const settings = await closeYearBudget(ledgerId, year);
    return c.json(settings, 200);
  },
});
