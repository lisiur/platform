import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { listPositions } from "#services/position.service";
import { assertPermission } from "#services/role-permission.service";
import { listPositionsResponseSchema, orgIdParamSchema } from "./schema";

export const listPositionsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{orgId}/positions",
    tags: ["Position"],
    summary: "List positions",
    description: "List all positions in an organization.",
    request: {
      params: orgIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": { schema: listPositionsResponseSchema },
        },
        description: "List of positions",
      },
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId } = c.req.valid("param");

    await assertPermission(session.user.id, "position::list", {
      appId: "organization",
      organizationId: orgId,
    });

    const positions = await listPositions(orgId);

    return c.json(
      {
        positions: positions.map((p) => ({
          ...p,
          membersCount: p._count.memberPositions,
        })),
      },
      200,
    );
  },
});
