import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { listPositionMembers } from "#services/position.service";
import { assertPermission } from "#services/role-permission.service";
import { orgIdParamSchema, positionIdParamSchema } from "./schema";

export const listPositionMembersRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{orgId}/positions/{id}/members",
    tags: ["Position"],
    summary: "List position members",
    description: "List all members who have this position in an organization.",
    request: {
      params: orgIdParamSchema.merge(positionIdParamSchema),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": {
            schema: z
              .object({
                members: z.array(
                  z.object({
                    id: z.string(),
                    userId: z.string(),
                    role: z.string(),
                    departmentId: z.string().nullable(),
                    createdAt: z.date(),
                    user: z.object({
                      id: z.string(),
                      name: z.string(),
                      email: z.string(),
                      image: z.string().nullable(),
                    }),
                  }),
                ),
              })
              .openapi("ListPositionMembersResponse"),
          },
        },
        description: "List of members with this position",
      },
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");

    await assertPermission(session.user.id, "position::list", {
      appId: "organization",
      organizationId: orgId,
    });

    const members = await listPositionMembers(orgId, id);

    return c.json({ members }, 200);
  },
});
