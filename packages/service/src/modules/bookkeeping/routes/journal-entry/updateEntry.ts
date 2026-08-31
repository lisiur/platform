import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { updateEntry } from "../../journal.service";
import {
  createEntryBodySchema,
  entryIdParamSchema,
  journalEntrySchema,
  serializeEntry,
} from "./schema";

export const updateEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiEntry",
    method: "put",
    path: "/ledgers/{ledgerId}/entries/{id}",
    tags: ["QianlaiJournal"],
    summary: "Replace a journal entry (editor+, or the creator if a guest)",
    description:
      "Replaces the entry's date, memo, lines, and participants in full: the new lines must balance and every account must belong to this ledger. entryNo and the original creator are kept. Guests may only edit their own entries inside (and keeping them in) one of their projects.",
    request: {
      params: entryIdParamSchema,
      body: {
        content: {
          "application/json": { schema: createEntryBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(journalEntrySchema, "The updated entry"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    const body = c.req.valid("json");
    // "guest" = any member; guests may only edit their own entries inside
    // their projects (enforced in the service).
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    assertLedgerWritable(access.ledger);
    const entry = await updateEntry(
      ledgerId,
      id,
      { userId, role: access.membership.role },
      body,
    );
    return c.json(serializeEntry(entry), 200);
  },
});
