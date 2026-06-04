import {
  createRoute,
  defineOpenAPIRoute,
  OpenAPIHono,
  z,
} from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  errorSchema,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { menuSchema } from "#routes/menu/schema";
import {
  assignPermissionByMenuIds,
  getRoleMenus,
} from "#services/role-permission.service";
import { prepend } from "#utils/list";

const roleIdParamSchema = z.object({
  roleId: z.string().min(1),
});

export const getRoleMenusRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("role::list")),
    method: "get",
    path: "/{roleId}",
    tags: ["RoleMenus"],
    summary: "Get menus for a role",
    description: "Returns menus assigned to a role through permissions.",
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        z.object({ menus: menuSchema.array() }).openapi("RoleMenusResponse"),
        "Menus assigned to the role",
      ),
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Role not found",
      },
    },
  }),
  handler: async (c) => {
    const { roleId } = c.req.valid("param");
    const menus = await getRoleMenus(roleId);
    return c.json({ menus }, 200);
  },
});

export const batchAssignRoleMenus = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("role::update")),
    method: "put",
    path: "/batch",
    tags: ["RoleMenus"],
    summary: "Batch assign menus to role",
    description:
      "Replaces all menu assignments for a role through permissions.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                roleId: z.string().min(1),
                menuIds: z.array(z.string()),
              })
              .openapi("BatchAssignRoleMenusBody"),
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        z.object({ menus: menuSchema.array() }).openapi("RoleMenusResponse"),
        "Updated menu assignments for the role",
      ),
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Role not found",
      },
    },
  }),
  handler: async (c) => {
    const { roleId, menuIds } = c.req.valid("json");

    const menus = await assignPermissionByMenuIds(roleId, menuIds);

    logAudit({
      event: "role.menus_assigned",
      category: "role",
      targetId: roleId,
      metadata: { menuIds },
      c,
    });

    return c.json({ menus }, 200);
  },
});

const roleMenusRoutes = new OpenAPIHono();

const routes = roleMenusRoutes.openapiRoutes([
  getRoleMenusRoute,
  batchAssignRoleMenus,
] as const);

export { routes as roleMenusRoutes };
