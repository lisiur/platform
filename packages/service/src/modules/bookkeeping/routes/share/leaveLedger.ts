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
import { leaveLedger } from "../../share.service";
import { ledgerIdParamSchema } from "./schema";

export const leaveLedgerRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "leaveQianlaiLedger",
    method: "post",
    path: "/ledgers/{ledgerId}/leave",
    tags: ["QianlaiShare"],
    summary: "Leave a ledger",
    description:
      "Members may leave at any time; owners must transfer ownership or delete the ledger instead.",
    request: {
      params: ledgerIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "Left the ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    return c.json(await leaveLedger(ledgerId, userId), 200);
  },
});
