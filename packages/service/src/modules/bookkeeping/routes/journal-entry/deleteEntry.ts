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
    summary: "Delete a journal entry (editor+)",
    description:
      "Entries are immutable once posted; corrections are made by deleting and re-posting.",
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
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    return c.json(await deleteEntry(ledgerId, id), 200);
  },
});
