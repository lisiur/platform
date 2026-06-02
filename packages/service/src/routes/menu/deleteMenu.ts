import { createRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { definePermissionRoute } from "#routes/shared/admin-route";
import { deleteMenu as deleteMenuService } from "#services/menu.service";
import { deleteSuccessSchema, errorSchema, menuIdParamSchema } from "./schema";

export const deleteMenu = definePermissionRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Delete a menu",
    description:
      "Delete a menu by ID. All children are cascade-deleted via Prisma.",
    request: {
      params: menuIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: deleteSuccessSchema },
        },
        description: "Successfully deleted",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  permission: "menu::delete",
  handler: async (c) => {
    const { id } = c.req.valid("param");

    const { name } = await deleteMenuService(id);

    logAudit({
      event: "menu.deleted",
      category: "menu",
      targetId: id,
      targetName: name,
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
