import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { deleteEntry } from "../../journal.service";
import { entryIdParamSchema } from "./schema";

export const deleteEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiEntry",
    method: "delete",
    path: "/ledgers/{ledgerId}/entries/{id}",
    tags: ["QianlaiJournal"],
    summary: "Delete a journal entry (editor+, or the creator if a guest)",
    description:
      "Entries are immutable once posted; corrections are made by deleting and re-posting. Guests may only delete entries they created inside their projects.",
    request: {
      params: entryIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    // "guest" = any member; guests may only delete their own entries
    // (enforced in the service).
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    assertLedgerWritable(access.ledger);
    return c.json(
      await deleteEntry(ledgerId, id, {
        userId,
        role: access.membership.role,
      }),
      200,
    );
  },
});
