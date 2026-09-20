import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess, resolveEntryProjectFilter } from "../../access";
import { categorySummary } from "../../report.service";
import {
  categorySummaryQuerySchema,
  categorySummaryResponseSchema,
  ledgerIdParamSchema,
  statWindowArgs,
} from "./schema";

export const categorySummaryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiCategorySummary",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/category-summary",
    tags: ["QianlaiReport"],
    summary: "Per-category income vs expense totals",
    description:
      "Each category's gross income and expense in integer cents over the journal's filter surface — the daily summary's numerator (`shareMode`) keyed per account: \"line\" sums raw journal lines (expense lines' debit-net feeds expense, income lines' credit-net feeds income, transfers count toward neither); \"members\" splits each entry across its participant set and counts only the ledger members' slices, so non-ledger-member portions of split entries fall out. The same entry set (and guest project clamping) as the entry list and the daily summary, so the composition chart reconciles with the trend chart beside it when they share a mode. `name`/`code` (and the parent pair) let clients render seeded categories' localized labels and disambiguate same-named leaves.",
    request: {
      params: ledgerIdParamSchema,
      query: categorySummaryQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(categorySummaryResponseSchema, "Per-category totals"),
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
    const summary = await categorySummary(
      ledgerId,
      statWindowArgs(query, projectId, scopeProjectIds),
    );
    return c.json(summary, 200);
  },
});
