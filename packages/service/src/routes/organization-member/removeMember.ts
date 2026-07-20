import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { removeMember } from "#services/member.service";
import { assertAccess } from "#services/role-permission.service";

const memberParamsSchema = z.object({
  orgId: z.string(),
  memberId: z.string(),
});

export const removeOrganizationMember = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{orgId}/members/{memberId}",
    tags: ["Organization"],
    summary: "Remove a member from an organization",
    description: "Removes a member from the given organization.",
    request: {
      params: memberParamsSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      200: {
        content: { "application/json": { schema: deleteSuccessSchema } },
        description: "Member removed",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId, memberId } = c.req.valid("param");

    await assertAccess(principal, "organization-member::remove", {
      appId: "organization",
      organizationId: orgId,
    });

    await removeMember(orgId, memberId);

    await logAudit({
      c,
      event: "organization.member.removed",
      category: "organization",
    });

    return c.json({ success: true as const }, 200);
  },
});
