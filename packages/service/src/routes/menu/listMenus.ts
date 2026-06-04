import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listMenus as listMenusService } from "#services/menu.service";
import { prepend } from "#utils/list";
import { listMenusQuerySchema, listMenusResponseSchema } from "./schema";

export const listMenus = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("menu::list")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listMenusResponseSchema, "Flat list of menus"),
    },
  }),
  handler: async (c) => {
    const { appId } = c.req.valid("query");

    const result = await listMenusService(appId);

    return c.json(result, 200);
  },
});
