import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { createMenu as createMenuService } from "#services/menu.service";
import { prepend } from "#utils/list";
import { createMenuBodySchema, menuSchema } from "./schema";

export const createMenu = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("menu::create")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(menuSchema, "The created menu"),
    },
  }),
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
