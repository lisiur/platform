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
      "Net worth (assets − liabilities, accounting-true), the selected month's (defaults to current) income vs expense across the LEDGER MEMBERS' actual shares — each entry splits across its participant set and only roster members' slices count (project outsiders' shares drop out; untagged entries count for their payer, full when the payer is a member), with the journal's visibility rule: guest posts stay counted even when opted out, only non-guest opt-outs drop — and the 5 most recent ledger-activity entries (member + guest posts).",
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
