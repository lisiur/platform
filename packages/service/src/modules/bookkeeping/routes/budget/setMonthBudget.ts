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
import { setMonthBudget } from "../../budget.service";
import {
  budgetSettingsSchema,
  ledgerIdParamSchema,
  setMonthBudgetBodySchema,
} from "./schema";

export const setMonthBudgetRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "setQianlaiMonthBudget",
    method: "put",
    path: "/ledgers/{ledgerId}/budget/month",
    tags: ["QianlaiBudget"],
    summary:
      "Pin a single month to its own budget amount (upsert; no per-month delete)",
    description:
      "Deviates one month from the year's monthly amount — a heavier December, a lighter February. Upsert only: the override can be re-adjusted to any amount, but there is no delete entry for a single month; closing the year's budget clears every override with it. Requires the year budget to exist.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: setMonthBudgetBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(budgetSettingsSchema, "The updated settings"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year, month, cents } = c.req.valid("json");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const settings = await setMonthBudget(ledgerId, year, month, cents);
    return c.json(settings, 200);
  },
});
