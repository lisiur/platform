import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { deletePosition } from "#services/position.service";
import { assertPermission } from "#services/role-permission.service";
import { orgIdParamSchema, positionIdParamSchema } from "./schema";

export const deletePositionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{orgId}/positions/{id}",
    tags: ["Position"],
    summary: "Delete a position",
    description: "Delete a position from an organization.",
    request: {
      params: orgIdParamSchema.merge(positionIdParamSchema),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      200: {
        content: { "application/json": { schema: deleteSuccessSchema } },
        description: "Position deleted",
      },
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");

    await assertPermission(session.user.id, "position::delete", {
      appId: "organization",
      organizationId: orgId,
    });

    const position = await deletePosition(orgId, id);

    logAudit({
      event: "position.deleted",
      category: "position",
      targetType: "position",
      targetId: position.id,
      targetName: position.name,
      c,
    });

    return c.json({ success: true } as const, 200);
  },
});
