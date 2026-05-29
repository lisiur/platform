import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { getMenuById } from "../../services/menu.service";
import { errorSchema, menuIdParamSchema, menuSchema } from "./schema";

export const getMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Get a menu",
    description: "Returns a single menu by ID.",
    middleware: requireAdmin,
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

    const menu = await getMenuById(id);

    return c.json(menu, 200);
  },
});
