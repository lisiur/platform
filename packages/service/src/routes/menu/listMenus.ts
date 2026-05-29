import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listMenus as listMenusService } from "#services/menu.service";
import {
  errorSchema,
  listMenusQuerySchema,
  listMenusResponseSchema,
} from "./schema";

export const listMenus = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Menu"],
    summary: "List menus",
    description:
      "Returns a flat list of menus for the given appId, sorted by sortOrder.",
    middleware: requireAdmin,
    request: {
      query: listMenusQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listMenusResponseSchema,
          },
        },
        description: "Flat list of menus",
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
    const { appId } = c.req.valid("query");

    const result = await listMenusService(appId);

    return c.json(result, 200);
  },
});
