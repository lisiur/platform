import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { getAssignedPositionPermissions } from "#services/position.service";
import { assertAccess } from "#services/role-permission.service";
import {
  orgIdParamSchema,
  positionAssignedPermissionsResponseSchema,
  positionIdParamSchema,
} from "./schema";

export const getPositionPermissionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getPositionPermissions",
    method: "get",
    path: "/{orgId}/positions/{id}/permissions",
    tags: ["Position"],
    summary: "Get permissions assigned to a position",
    description: "Returns the permissions currently assigned to a position.",
    request: {
      params: orgIdParamSchema.merge(positionIdParamSchema),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        positionAssignedPermissionsResponseSchema,
        "Permissions assigned to the position",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");

    await assertAccess(
      principal,
      "org/position-permission:manage",
      orgScope(orgId),
    );

    const assigned = await getAssignedPositionPermissions(orgId, id);
    return c.json({ assigned }, 200);
  },
});
