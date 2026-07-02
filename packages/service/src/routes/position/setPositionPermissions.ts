import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { setPositionPermissions } from "#services/position.service";
import { assertPermission } from "#services/role-permission.service";
import {
  orgIdParamSchema,
  positionAssignedPermissionsResponseSchema,
  positionIdParamSchema,
  setPositionPermissionsBodySchema,
} from "./schema";

export const setPositionPermissionsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{orgId}/positions/{id}/permissions",
    tags: ["Position"],
    summary: "Set position permissions",
    description: "Replace all permissions assigned to a position.",
    request: {
      params: orgIdParamSchema.merge(positionIdParamSchema),
      body: {
        content: {
          "application/json": {
            schema: setPositionPermissionsBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        positionAssignedPermissionsResponseSchema,
        "Updated position permissions",
      ),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertPermission(session.user.id, "position-permission::manage", {
      appId: "organization",
      organizationId: orgId,
    });

    const result = await setPositionPermissions(orgId, id, body.permissionIds);

    logAudit({
      event: "position.permissions_updated",
      category: "position",
      targetType: "position",
      targetId: id,
      metadata: { permissionIds: body.permissionIds },
      c,
    });

    return c.json(result, 200);
  },
});
