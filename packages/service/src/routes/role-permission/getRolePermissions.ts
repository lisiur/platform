import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requirePrincipal } from "#extractors/session";
import { prisma } from "#lib/db";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import {
  assertAccess,
  getPermissionsForRole,
} from "#services/role-permission.service";
import { roleIdParamSchema, rolePermissionsResponseSchema } from "./schema";

export const getRolePermissions = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{roleId}",
    tags: ["RolePermissions"],
    summary: "Get permissions assigned to a role",
    description: "Returns the permissions currently assigned to a role.",
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        rolePermissionsResponseSchema,
        "Permissions assigned to the role",
      ),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/role:list");
    const { roleId } = c.req.valid("param");

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new HTTPException(404, { message: "Role not found" });
    }

    const permissions = await getPermissionsForRole(roleId);
    return c.json({ permissions }, 200);
  },
});
