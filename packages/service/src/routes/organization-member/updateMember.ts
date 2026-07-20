import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateMember } from "#services/member.service";
import { assertAccess } from "#services/role-permission.service";
import {
  memberIdParamSchema,
  memberSchema,
  orgIdParamSchema,
  updateMemberBodySchema,
} from "./schema";

export const updateOrganizationMember = defineOpenAPIRoute({
  route: createRoute({
    method: "patch",
    path: "/{orgId}/members/{memberId}",
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
    const principal = await requirePrincipal(c);
    const { orgId, memberId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "organization-member::update", {
      appId: "organization",
      organizationId: orgId,
    });

    const member = await updateMember(orgId, memberId, body);

    logAudit({
      event: "member.updated",
      category: "member",
      c,
    });

    return c.json(member, 200);
  },
});
