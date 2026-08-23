import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  conflictResponse,
  forbiddenResponse,
  idParamSchema,
  notFoundResponse,
  okResponseFn,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { setDefaultLedger } from "../../ledger.service";

export const setDefaultLedgerRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "setDefaultQianlaiLedger",
    method: "post",
    path: "/ledgers/{id}/default",
    tags: ["QianlaiLedger"],
    summary: "Set a ledger as the default (owner only)",
    request: {
      params: idParamSchema(),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...conflictResponse,
      ...okResponseFn(successSchema, "Default ledger updated"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { id } = c.req.valid("param");
    await requireLedgerAccess(userId, id, "owner");
    return c.json(await setDefaultLedger(userId, id), 200);
  },
});
