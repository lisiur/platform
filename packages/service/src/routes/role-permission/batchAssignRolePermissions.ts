import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import {
  assertAccess,
  assignPermissions,
  getPermissionsForRole,
} from "#services/role-permission.service";
import {
  batchAssignRolePermissionsBodySchema,
  rolePermissionsResponseSchema,
} from "./schema";

export const batchAssignRolePermissions = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/batch",
    tags: ["RolePermissions"],
    summary: "Batch assign permissions to role",
    description: "Replaces all permissions assigned to a role.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: batchAssignRolePermissionsBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        rolePermissionsResponseSchema,
        "Updated permissions for the role",
      ),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "role::update");
    const { roleId, permissionIds } = c.req.valid("json");

    await assignPermissions(roleId, permissionIds);

    logAudit({
      event: "role.permissions_assigned",
      category: "role",
      metadata: { permissionIds },
      c,
    });

    const permissions = await getPermissionsForRole(roleId);
    return c.json({ permissions }, 200);
  },
});
