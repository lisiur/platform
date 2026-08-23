import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  idParamSchema,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { deleteLedger } from "../../ledger.service";

export const deleteLedgerRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiLedger",
    method: "delete",
    path: "/ledgers/{id}",
    tags: ["QianlaiLedger"],
    summary: "Delete a ledger (owner only)",
    description:
      "Deletes the ledger with its members, share codes, accounts and journal entries.",
    request: {
      params: idParamSchema(),
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
    const { id } = c.req.valid("param");
    await requireLedgerAccess(userId, id, "owner");
    return c.json(await deleteLedger(userId, id), 200);
  },
});
