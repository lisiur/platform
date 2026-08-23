import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
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
    const access = await requireLedgerAccess(userId, ledgerId, "viewer");
    const result = await listEntries(
      ledgerId,
      {
        limit: query.limit,
        offset: query.offset,
        from: query.from,
        to: query.to,
        q: query.q,
      },
      access.membership.role,
    );
    return c.json(
      { entries: result.entries.map(serializeEntry), total: result.total },
      200,
    );
  },
});
