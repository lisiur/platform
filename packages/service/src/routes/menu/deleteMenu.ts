import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { deleteMenu as deleteMenuService } from "../../services/menu.service";
import { deleteSuccessSchema, errorSchema, menuIdParamSchema } from "./schema";

export const deleteMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Delete a menu",
    description:
      "Delete a menu by ID. All children are cascade-deleted via Prisma.",
    middleware: requireAdmin,
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
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
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
