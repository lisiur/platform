import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createMenu as createMenuService } from "#services/menu.service";
import { assertAccess } from "#services/role-permission.service";
import { createMenuBodySchema, menuSchema } from "./schema";

export const createMenu = defineOpenAPIRoute({
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(menuSchema, "The created menu"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "menu::create");
    const body = c.req.valid("json");

    const menu = await createMenuService(body);

    logAudit({
      event: "menu.created",
      category: "menu",
      c,
    });

    return c.json(menu, 201);
  },
});
