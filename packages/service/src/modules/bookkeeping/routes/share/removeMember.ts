import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { removeMember } from "../../share.service";
import { memberParamSchema } from "./schema";

export const removeMemberRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "removeQianlaiLedgerMember",
    method: "delete",
    path: "/ledgers/{ledgerId}/members/{userId}",
    tags: ["QianlaiShare"],
    summary: "Remove a member (owner only)",
    request: {
      params: memberParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(deleteSuccessSchema, "Removal confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, userId: targetUserId } = c.req.valid("param");
    await requireLedgerAccess(userId, ledgerId, "owner");
    return c.json(await removeMember(ledgerId, targetUserId), 200);
  },
});
