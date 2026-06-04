import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { reorderMenus as reorderMenusService } from "#services/menu.service";
import { prepend } from "#utils/list";
import { reorderMenusBodySchema, reorderMenusResponseSchema } from "./schema";

export const reorderMenus = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("menu::reorder")),
    method: "post",
    path: "/reorder",
    tags: ["Menu"],
    summary: "Reorder menus",
    description:
      "Batch update menu positions after drag-and-drop. Recalculates sortOrder for all siblings atomically.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: reorderMenusBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(
        reorderMenusResponseSchema,
        "Updated menus with recalculated sortOrder",
      ),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");

    const result = await reorderMenusService(body.items);

    return c.json(result, 200);
  },
});
