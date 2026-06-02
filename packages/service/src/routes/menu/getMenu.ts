import { createRoute } from "@hono/zod-openapi";
import { definePermissionRoute } from "#routes/shared/admin-route";
import { getMenuById } from "#services/menu.service";
import { errorSchema, menuIdParamSchema, menuSchema } from "./schema";

export const getMenu = definePermissionRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Get a menu",
    description: "Returns a single menu by ID.",
    request: {
      params: menuIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: menuSchema },
        },
        description: "The menu",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  permission: "menu::view",
  handler: async (c) => {
    const { id } = c.req.valid("param");

    const menu = await getMenuById(id);

    return c.json(menu, 200);
  },
});
