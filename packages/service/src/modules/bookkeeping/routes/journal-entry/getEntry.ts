import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { entryScopeProjectIds, requireLedgerAccess } from "../../access";
import { getEntry } from "../../journal.service";
import {
  entryIdParamSchema,
  journalEntrySchema,
  serializeEntry,
} from "./schema";

export const getEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiEntry",
    method: "get",
    path: "/ledgers/{ledgerId}/entries/{id}",
    tags: ["QianlaiJournal"],
    summary: "Get a journal entry",
    request: {
      params: entryIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(journalEntrySchema, "The journal entry with its lines"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    const scopeProjectIds = await entryScopeProjectIds(userId, access);
    return c.json(
      serializeEntry(
        await getEntry(ledgerId, id, access.membership.role, scopeProjectIds),
      ),
      200,
    );
  },
});
