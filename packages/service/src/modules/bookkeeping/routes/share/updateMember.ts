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
import { updateMember } from "../../share.service";
import { memberParamSchema, updateMemberBodySchema } from "./schema";

export const updateMemberRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiMember",
    method: "patch",
    path: "/ledgers/{ledgerId}/members/{userId}",
    tags: ["QianlaiShare"],
    summary: "Update a member (role: owner-only; rename: editor+)",
    description:
      "With `role`, switches the target member between editor and viewer (owner only; virtual members have a fixed viewer role). With `name`, renames a virtual member (editor+). The owner row is protected — use transfer ownership to reassign it.",
    request: {
      params: memberParamSchema,
      body: {
        content: {
          "application/json": { schema: updateMemberBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "Member updated"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, userId: targetUserId } = c.req.valid("param");
    // Floor editor: renames are editor+; the service re-verifies owner under
    // the lock when the body carries a role change.
    await requireLedgerAccess(userId, ledgerId, "editor");
    const body = c.req.valid("json");
    return c.json(
      await updateMember(ledgerId, userId, targetUserId, body),
      200,
    );
  },
});
