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
import { updateMemberRole } from "../../share.service";
import { memberParamSchema, updateMemberRoleBodySchema } from "./schema";

export const updateMemberRoleRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiMemberRole",
    method: "patch",
    path: "/ledgers/{ledgerId}/members/{userId}",
    tags: ["QianlaiShare"],
    summary: "Change a member's role (owner only)",
    description:
      "Switches the target member between editor and viewer. The owner row is protected — use transfer ownership to reassign it.",
    request: {
      params: memberParamSchema,
      body: {
        content: {
          "application/json": { schema: updateMemberRoleBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "Role updated"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, userId: targetUserId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    await requireLedgerAccess(userId, ledgerId, "owner");
    return c.json(
      await updateMemberRole(ledgerId, userId, targetUserId, role),
      200,
    );
  },
});
