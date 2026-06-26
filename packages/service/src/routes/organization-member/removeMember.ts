import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import { z } from "@hono/zod-openapi";
import {
  badRequestResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { removeMember } from "#services/member.service";
import { assertPermission } from "#services/role-permission.service";

const memberParamsSchema = z.object({
  id: z.string(),
  memberId: z.string(),
});

export const removeOrganizationMember = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}/members/{memberId}",
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
    const session = await requireSession(c);
    const { id, memberId } = c.req.valid("param");

    await assertPermission(session.user.id, "organization-member::remove", {
      appId: "organization",
      organizationId: id,
    });

    await removeMember(id, memberId);

    await logAudit({
      c,
      event: "organization.member.removed",
      category: "organization",
      targetType: "organization",
      targetId: id,
    });

    return c.json({ success: true as const }, 200);
  },
});
