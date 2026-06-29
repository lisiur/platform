import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateMember } from "#services/member.service";
import { assertPermission } from "#services/role-permission.service";
import {
  memberIdParamSchema,
  memberSchema,
  orgIdParamSchema,
  updateMemberBodySchema,
} from "./schema";

export const updateOrganizationMember = defineOpenAPIRoute({
  route: createRoute({
    method: "patch",
    path: "/{id}/members/{memberId}",
    tags: ["Organization Member"],
    summary: "Update a member",
    request: {
      params: orgIdParamSchema.extend(memberIdParamSchema.shape),
      body: {
        content: {
          "application/json": { schema: updateMemberBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...okResponseFn(memberSchema, "The updated member"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { id, memberId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertPermission(session.user.id, "organization-member::update", {
      appId: "organization",
      organizationId: id,
    });

    const member = await updateMember(id, memberId, body);

    logAudit({
      event: "member.updated",
      category: "member",
      targetType: "member",
      targetId: member.id,
      targetName: memberId,
      c,
    });

    return c.json(member, 200);
  },
});
