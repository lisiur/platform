import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { updateLedgerPreferences } from "../../preference.service";
import { ledgerIdParamSchema, quickEntryDataSchema } from "./schema";

export const updateLedgerPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiLedgerPreferences",
    method: "put",
    path: "/preferences/ledger/{ledgerId}",
    tags: ["QianlaiPreference"],
    summary:
      "Upsert the caller's ledger-scope preferences (quick-entry chips); any member including guests",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: quickEntryDataSchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(quickEntryDataSchema, "The stored quick-entry payload"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const body = c.req.valid("json");
    // Preferences are private to the caller, so "guest" is the right floor —
    // every ledger member may arrange their own chips.
    await requireLedgerAccess(userId, ledgerId, "guest");
    const saved = await updateLedgerPreferences(userId, ledgerId, body);
    return c.json(saved, 200);
  },
});
