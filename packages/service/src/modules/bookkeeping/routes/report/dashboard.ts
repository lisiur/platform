import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess, resolveEntryProjectFilter } from "../../access";
import { dashboard } from "../../report.service";
import { serializeEntry } from "../journal-entry/schema";
import {
  dashboardQuerySchema,
  dashboardResponseSchema,
  ledgerIdParamSchema,
  statWindowArgs,
} from "./schema";

export const dashboardRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiDashboard",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/dashboard",
    tags: ["QianlaiReport"],
    summary: "Dashboard summary of the ledger",
    description:
      "Net worth (assets − liabilities, accounting-true), the selected month's (defaults to current) income vs expense across the LEDGER MEMBERS' actual shares — each entry splits across its participant set and only roster members' slices count (project outsiders' shares drop out; untagged entries count for their payer, full when the payer is a member), with the journal's visibility rule: guest posts stay counted even when opted out, only non-guest opt-outs drop — and the 5 most recent ledger-activity entries (member + guest posts). Beyond the window, the request may carry the journal's stat filter surface (participant, project, category, kind, … — the same fields and entry set as the daily/category summaries, guest-clamped the same way) so a filtered chart page's totals describe exactly the rows it lists; the numerator is shareMode (default members, the ledger's own caliber — a project-filtered caller asks for line to speak the project's raw books).",
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
    const query = c.req.valid("query");
    const access = await requireLedgerAccess(userId, ledgerId, "viewer");
    const { projectId, scopeProjectIds } = await resolveEntryProjectFilter(
      userId,
      access,
      query.projectId,
    );
    const result = await dashboard(
      ledgerId,
      access.membership.role,
      new Date(),
      statWindowArgs(query, projectId, scopeProjectIds),
    );
    return c.json(
      { ...result, recentEntries: result.recentEntries.map(serializeEntry) },
      200,
    );
  },
});
