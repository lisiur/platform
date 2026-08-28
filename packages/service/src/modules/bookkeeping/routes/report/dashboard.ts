import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { dashboard } from "../../report.service";
import { serializeEntry } from "../journal-entry/schema";
import {
  dashboardQuerySchema,
  dashboardResponseSchema,
  ledgerIdParamSchema,
} from "./schema";

export const dashboardRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiDashboard",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/dashboard",
    tags: ["QianlaiReport"],
    summary: "Dashboard summary of the ledger",
    description:
      "Net worth (assets − liabilities), the selected month's (defaults to current) income vs expense, and the 5 most recent entries.",
    request: {
      params: ledgerIdParamSchema,
      query: dashboardQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(dashboardResponseSchema, "Dashboard summary"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { from, to } = c.req.valid("query");
    const access = await requireLedgerAccess(userId, ledgerId, "viewer");
    const result = await dashboard(
      ledgerId,
      access.membership.role,
      new Date(),
      { from, to },
    );
    return c.json(
      { ...result, recentEntries: result.recentEntries.map(serializeEntry) },
      200,
    );
  },
});
