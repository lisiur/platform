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
import { setExcludedCategories } from "../../budget.service";
import {
  budgetSettingsSchema,
  budgetYearQuerySchema,
  ledgerIdParamSchema,
  setExcludedCategoriesBodySchema,
} from "./schema";

export const setExcludedCategoriesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "setQianlaiBudgetExcludedCategories",
    method: "put",
    path: "/ledgers/{ledgerId}/budget/excluded-categories",
    tags: ["QianlaiBudget"],
    summary:
      'Replace the budget-excluded expense categories at any depth (entries under them default to "exclude from budget")',
    description:
      "Full replacement list. Shapes how FUTURE entries default at posting time; stored entries keep the flag they were saved with. Year-independent, unlike the amounts — the year query only shapes the settings payload the write returns.",
    request: {
      params: ledgerIdParamSchema,
      query: budgetYearQuerySchema,
      body: {
        content: {
          "application/json": { schema: setExcludedCategoriesBodySchema },
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
    const { year } = c.req.valid("query");
    const { excludedAccountIds } = c.req.valid("json");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const settings = await setExcludedCategories(
      ledgerId,
      year,
      excludedAccountIds,
    );
    return c.json(settings, 200);
  },
});
