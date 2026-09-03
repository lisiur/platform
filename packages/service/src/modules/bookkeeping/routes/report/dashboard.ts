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
      "Net worth (assets − liabilities, accounting-true), the selected month's (defaults to current) income vs expense share-based for the viewer (each entry counts at the viewer's participant share), and the 5 most recent ledger-activity entries (member + guest posts).",
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
      userId,
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
