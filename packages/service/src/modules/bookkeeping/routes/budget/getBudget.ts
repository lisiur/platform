import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { getBudgetSettings } from "../../budget.service";
import {
  budgetSettingsSchema,
  budgetYearQuerySchema,
  ledgerIdParamSchema,
} from "./schema";

export const getBudgetRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiBudget",
    method: "get",
    path: "/ledgers/{ledgerId}/budget",
    tags: ["QianlaiBudget"],
    summary:
      "One year's budget settings (the year's monthly amount, single-month overrides, excluded categories)",
    request: {
      params: ledgerIdParamSchema,
      query: budgetYearQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(budgetSettingsSchema, "The budget settings for the year"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    const settings = await getBudgetSettings(ledgerId, year);
    return c.json(settings, 200);
  },
});
