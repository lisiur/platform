import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { createEntry } from "../../journal.service";
import {
  createEntryBodySchema,
  journalEntrySchema,
  ledgerIdParamSchema,
  serializeEntry,
} from "./schema";

export const createEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiEntry",
    method: "post",
    path: "/ledgers/{ledgerId}/entries",
    tags: ["QianlaiJournal"],
    summary: "Post a journal entry (editor+, or guest in their project)",
    description:
      "Creates a balanced, immutable journal entry: total debits must equal total credits and every line references an account of this ledger. Optionally tags ledger members as participants of the entry for turnover reports, and assigns the entry to a project. Guests must target one of their projects and may only record expenses (expense categories; the payment side defers to the default pocket).",
    request: {
      params: ledgerIdParamSchema,
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
      ...createdResponseFn(journalEntrySchema, "The posted entry"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const body = c.req.valid("json");
    // "guest" = any member; project/guest entitlements are enforced in the
    // service against the caller's project memberships.
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    assertLedgerWritable(access.ledger);
    const entry = await createEntry(userId, ledgerId, body, access);
    return c.json(serializeEntry(entry), 201);
  },
});
