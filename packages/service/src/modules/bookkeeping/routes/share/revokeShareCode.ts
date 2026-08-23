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
import { revokeShareCode } from "../../share.service";
import { shareCodeParamSchema } from "./schema";

export const revokeShareCodeRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "revokeQianlaiShareCode",
    method: "delete",
    path: "/ledgers/{ledgerId}/share-codes/{id}",
    tags: ["QianlaiShare"],
    summary: "Revoke a share code (owner only)",
    request: {
      params: shareCodeParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Revocation confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    await requireLedgerAccess(userId, ledgerId, "owner");
    return c.json(await revokeShareCode(ledgerId, id), 200);
  },
});
