import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { buildBudgetReport } from "../../budget.service";
import {
  budgetReportQuerySchema,
  budgetReportResponseSchema,
  ledgerIdParamSchema,
} from "./schema";

export const getBudgetReportRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiBudgetReport",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/budget",
    tags: ["QianlaiBudget"],
    summary:
      "The budget card's numbers: the anchor month's pools plus the year-to-date table",
    description:
      "The anchor month (year + month + the client's fixed UTC offset) returns its effective budget, the counted expense pool, and the display-only excluded pool; the year table walks from the year's first recorded month to the month BEFORE the anchor — the current month never participates — with surpluses cancelling overspends in netCents. month/year are null when no budget is set.",
    request: {
      params: ledgerIdParamSchema,
      query: budgetReportQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(budgetReportResponseSchema, "The budget report"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { year, month, tzOffsetMinutes } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    const report = await buildBudgetReport(
      ledgerId,
      year,
      month,
      tzOffsetMinutes,
    );
    return c.json(report, 200);
  },
});
