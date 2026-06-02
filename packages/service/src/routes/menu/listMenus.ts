import { createRoute } from "@hono/zod-openapi";
import { definePermissionRoute } from "#routes/shared/admin-route";
import { listMenus as listMenusService } from "#services/menu.service";
import { listMenusQuerySchema, listMenusResponseSchema } from "./schema";

export const listMenus = definePermissionRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Menu"],
    summary: "List menus",
    description:
      "Returns a flat list of menus for the given appId, sorted by sortOrder.",
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
    },
  }),
  permission: "menu::list",
  handler: async (c) => {
    const { appId } = c.req.valid("query");

    const result = await listMenusService(appId);

    return c.json(result, 200);
  },
});
