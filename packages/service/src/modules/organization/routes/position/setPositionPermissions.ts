import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { setPositionPermissions } from "#modules/organization/position.service";
import {
  orgIdParamSchema,
  positionAssignedPermissionsResponseSchema,
  positionIdParamSchema,
  setPositionPermissionsBodySchema,
} from "./schema";

export const setPositionPermissionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "setPositionPermissions",
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
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(
      principal,
      "org/position-permission:manage",
      orgScope(orgId),
    );

    const result = await setPositionPermissions(orgId, id, body.permissionIds);

    logAudit({
      event: "position.permissions_updated",
      category: "position",
      metadata: { permissionIds: body.permissionIds },
      c,
    });

    return c.json(result, 200);
  },
});
