import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { transferOwnership } from "../../share.service";
import { ledgerIdParamSchema, transferBodySchema } from "./schema";

export const transferOwnershipRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "transferQianlaiOwnership",
    method: "post",
    path: "/ledgers/{ledgerId}/transfer",
    tags: ["QianlaiShare"],
    summary: "Transfer ledger ownership (owner only)",
    description:
      "Transfers ownership to an existing member; the previous owner becomes an editor.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: transferBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "Ownership transferred"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { userId: targetUserId } = c.req.valid("json");
    await requireLedgerAccess(userId, ledgerId, "owner");
    return c.json(await transferOwnership(ledgerId, userId, targetUserId), 200);
  },
});
