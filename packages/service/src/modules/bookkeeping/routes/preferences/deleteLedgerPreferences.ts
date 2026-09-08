import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { clearPreferences } from "../../preference.service";
import { ledgerIdParamSchema } from "./schema";

export const deleteLedgerPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiLedgerPreferences",
    method: "delete",
    path: "/preferences/ledger/{ledgerId}",
    tags: ["QianlaiPreference"],
    summary:
      "Reset the caller's ledger-scope preferences to defaults; any current ledger member including guests",
    request: {
      params: ledgerIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Reset succeeded (idempotent)"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    // Preference rows belong to their ledger — the row's userId only marks
    // the creator — so resets need membership ("guest" floor): the creator
    // and the ledger owner alike qualify while they remain members. The
    // where clause still keys on the caller's own userId, so a reset can
    // only ever clear the caller's own row.
    await requireLedgerAccess(userId, ledgerId, "guest");
    await clearPreferences(userId, "ledger", ledgerId);
    return c.json({ success: true as const }, 200);
  },
});
