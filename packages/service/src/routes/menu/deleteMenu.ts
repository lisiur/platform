import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteMenu as deleteMenuService } from "#services/menu.service";
import { prepend } from "#utils/list";
import { deleteSuccessSchema, menuIdParamSchema } from "./schema";

export const deleteMenu = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("menu::delete")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Successfully deleted"),
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
