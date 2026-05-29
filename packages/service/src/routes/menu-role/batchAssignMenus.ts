import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { batchAssignMenus as batchAssignMenusService } from "../../services/menu-role.service";
import {
  batchAssignBodySchema,
  errorSchema,
  roleMenusResponseSchema,
} from "./schema";

export const batchAssignMenus = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/batch",
    tags: ["MenuRole"],
    summary: "Batch assign menus to role",
    description:
      "Replaces all menu assignments for a role. Automatically includes descendant menus.",
    middleware: requireAdmin,
    request: {
      body: {
        content: { "application/json": { schema: batchAssignBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: roleMenusResponseSchema },
        },
        description: "Updated menu assignments for the role",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      400: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Bad Request",
      },
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
    const menus = await batchAssignMenusService(roleId, menuIds);

    logAudit({
      event: "menu_role.assigned",
      category: "menu_role",
      targetId: roleId,
      metadata: { menuIds: menus.map((m) => m.id) },
      c,
    });

    return c.json({ menus }, 200);
  },
});
