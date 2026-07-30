import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getMenuById } from "#services/menu.service";
import { assertAccess } from "#services/role-permission.service";
import { menuIdParamSchema, menuSchema } from "./schema";

export const getMenu = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getMenu",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/menu:view");
    const { id } = c.req.valid("param");

    const menu = await getMenuById(id);

    return c.json(menu, 200);
  },
});
