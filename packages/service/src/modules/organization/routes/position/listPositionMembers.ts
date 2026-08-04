import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { listPositionMembers } from "#modules/organization/position.service";
import { orgIdParamSchema, positionIdParamSchema } from "./schema";

export const listPositionMembersRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listPositionMembers",
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
                      avatar: z.string().nullable(),
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
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");

    await assertAccess(principal, "org/position:list", orgScope(orgId));

    const members = await listPositionMembers(orgId, id);

    return c.json({ members }, 200);
  },
});
