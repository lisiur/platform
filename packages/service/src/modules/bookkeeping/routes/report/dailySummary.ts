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
  statViewFlags,
} from "./schema";

export const dailySummaryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiDailySummary",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/daily-summary",
    tags: ["QianlaiReport"],
    summary: "Per-day income vs expense totals",
    description:
      "Each local day's gross income and expense in integer cents over the journal's filter surface — the same entry set (and guest project clamping) as the entry list, so the journal's day-section headers reconcile with the rows beneath them. The aggregation's numerator is `shareMode`: \"line\" sums raw journal lines (the income statement's semantics, expense lines' debit-net feeds expense, income lines' credit-net feeds income, transfers count toward neither); \"members\" splits each entry across its participant set and counts only the ledger members' slices, so non-ledger-member portions of split entries fall out — the same figure the dashboard's stat card summarizes. Days bucket under tzOffsetMinutes (east of UTC, the budget report's contract), and guests are clamped to their projects like the list is. `includeExcluded` widens the entry set past the ledger-activity predicate; `includeBudgetExcluded=false` removes entries the per-entry budget flag marks off.",
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
        shareMode: query.shareMode,
        ...statViewFlags(query),
      },
      query.tzOffsetMinutes,
    );
    return c.json({ days }, 200);
  },
});
