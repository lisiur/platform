import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { getMenuById } from "#services/menu.service";
import { prepend } from "#utils/list";
import { menuIdParamSchema, menuSchema } from "./schema";

export const getMenu = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("menu::view")),
    method: "get",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Get a menu",
    description: "Returns a single menu by ID.",
    request: {
      params: menuIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(menuSchema, "The menu"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");

    const menu = await getMenuById(id);

    return c.json(menu, 200);
  },
});
