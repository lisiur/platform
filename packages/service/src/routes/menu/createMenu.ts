import { createRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { definePermissionRoute } from "#routes/shared/admin-route";
import { createMenu as createMenuService } from "#services/menu.service";
import { createMenuBodySchema, errorSchema, menuSchema } from "./schema";

export const createMenu = definePermissionRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Menu"],
    summary: "Create a menu",
    description:
      "Create a new menu item. If parentId is provided, the menu is nested under that parent.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: createMenuBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: menuSchema },
        },
        description: "The created menu",
      },
      400: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Invalid parentId or duplicate code",
      },
    },
  }),
  permission: "menu::create",
  handler: async (c) => {
    const body = c.req.valid("json");

    const menu = await createMenuService(body);

    logAudit({
      event: "menu.created",
      category: "menu",
      targetId: menu.id,
      targetName: menu.name,
      c,
    });

    return c.json(menu, 201);
  },
});
