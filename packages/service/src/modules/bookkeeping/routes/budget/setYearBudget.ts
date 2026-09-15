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
import { setYearBudget } from "../../budget.service";
import {
  budgetSettingsSchema,
  ledgerIdParamSchema,
  setYearBudgetBodySchema,
} from "./schema";

export const setYearBudgetRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "setQianlaiYearBudget",
    method: "put",
    path: "/ledgers/{ledgerId}/budget",
    tags: ["QianlaiBudget"],
    summary:
      "Set (or re-set) the year's monthly budget — shared by every member, retroactive over the whole year",
    description:
      "Budget settings are ledger-wide shared state, so unlike the per-user preferences the write floor is editor. The amount covers EVERY month of the year — including already-recorded ones — so adopting a budget mid-year retroactively budgets those months. Single months deviate through the month-override route.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: setYearBudgetBodySchema },
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
    const { year, cents } = c.req.valid("json");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const settings = await setYearBudget(ledgerId, year, cents);
    return c.json(settings, 200);
  },
});
