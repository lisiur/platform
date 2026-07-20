import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateMenu as updateMenuService } from "#services/menu.service";
import { assertAccess } from "#services/role-permission.service";
import { menuIdParamSchema, menuSchema, updateMenuBodySchema } from "./schema";

export const updateMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Update a menu",
    description: "Update a menu by ID.",
    request: {
      params: menuIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateMenuBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(menuSchema, "The updated menu"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "menu::update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const menu = await updateMenuService(id, body);

    logAudit({
      event: "menu.updated",
      category: "menu",
      c,
    });

    return c.json(menu, 200);
  },
});
