import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { getMenusForRole } from "../../services/menu-role.service";
import {
  errorSchema,
  roleIdParamSchema,
  roleMenusResponseSchema,
} from "./schema";

export const getRoleMenus = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{roleId}",
    tags: ["MenuRole"],
    summary: "Get menus for a role",
    description: "Returns the list of menus assigned to the specified role.",
    middleware: requireAdmin,
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: roleMenusResponseSchema },
        },
        description: "Menus assigned to the role",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { roleId } = c.req.valid("param");
    const menus = await getMenusForRole(roleId);
    return c.json({ menus }, 200);
  },
});
