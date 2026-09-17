import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess, resolveEntryProjectFilter } from "../../access";
import { dailySummary } from "../../report.service";
import {
  dailySummaryQuerySchema,
  dailySummaryResponseSchema,
  ledgerIdParamSchema,
} from "./schema";

export const dailySummaryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiDailySummary",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/daily-summary",
    tags: ["QianlaiReport"],
    summary: "Per-day income vs expense totals",
    description:
      "Each local day's gross income and expense in integer cents over the journal's filter surface — the same entry set (and guest project clamping) as the entry list, so the journal's day-section headers reconcile with the rows beneath them. Accounting-true line split (the income statement's semantics, not the share-based statement): expense lines' debit-net feeds expense, income lines' credit-net feeds income, and transfers count toward neither. Days bucket under tzOffsetMinutes (east of UTC, the budget report's contract), and guests are clamped to their projects like the list is.",
    request: {
      params: ledgerIdParamSchema,
      query: dailySummaryQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(dailySummaryResponseSchema, "Per-day totals"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const query = c.req.valid("query");
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    const { projectId, scopeProjectIds } = await resolveEntryProjectFilter(
      userId,
      access,
      query.projectId,
    );
    const days = await dailySummary(
      ledgerId,
      {
        from: query.from,
        to: query.to,
        q: query.q,
        participantUserId: query.participantUserId,
        projectId,
        accountId: query.accountId,
        accountType: query.accountType,
        kind: query.kind,
        memberUserId: query.memberUserId,
        scopeProjectIds,
      },
      query.tzOffsetMinutes,
    );
    return c.json({ days }, 200);
  },
});
