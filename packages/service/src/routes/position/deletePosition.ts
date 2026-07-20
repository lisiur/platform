import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { deletePosition } from "#services/position.service";
import { assertAccess } from "#services/role-permission.service";
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
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");

    await assertAccess(principal, "position::delete", {
      appId: "organization",
      organizationId: orgId,
    });

    const _position = await deletePosition(orgId, id);

    logAudit({
      event: "position.deleted",
      category: "position",
      c,
    });

    return c.json({ success: true } as const, 200);
  },
});
