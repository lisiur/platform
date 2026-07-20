import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteMenu as deleteMenuService } from "#services/menu.service";
import { assertAccess } from "#services/role-permission.service";
import { deleteSuccessSchema, menuIdParamSchema } from "./schema";

export const deleteMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Delete a menu",
    description:
      "Delete a menu by ID. All children are cascade-deleted via Prisma.",
    request: {
      params: menuIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Successfully deleted"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "menu::delete");
    const { id } = c.req.valid("param");

    await deleteMenuService(id);

    logAudit({
      event: "menu.deleted",
      category: "menu",
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
