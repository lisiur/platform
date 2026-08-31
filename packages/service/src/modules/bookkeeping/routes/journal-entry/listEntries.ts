import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess, resolveEntryProjectFilter } from "../../access";
import { listEntries } from "../../journal.service";
import {
  ledgerIdParamSchema,
  listEntriesQuerySchema,
  listEntriesResponseSchema,
  serializeEntry,
} from "./schema";

export const listEntriesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiEntries",
    method: "get",
    path: "/ledgers/{ledgerId}/entries",
    tags: ["QianlaiJournal"],
    summary: "List journal entries",
    description:
      "Lists the ledger's journal entries. Guests only see entries of the projects they belong to (any projectId filter is clamped to that scope); full roles may filter by projectId freely.",
    request: {
      params: ledgerIdParamSchema,
      query: listEntriesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        listEntriesResponseSchema,
        "Journal entries of the ledger",
      ),
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
    const result = await listEntries(
      ledgerId,
      {
        limit: query.limit,
        offset: query.offset,
        from: query.from,
        to: query.to,
        q: query.q,
        participantMemberId: query.participantMemberId,
        projectId,
        scopeProjectIds,
      },
      access.membership.role,
    );
    return c.json(
      { entries: result.entries.map(serializeEntry), total: result.total },
      200,
    );
  },
});
