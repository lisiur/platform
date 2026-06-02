import { createRoute } from "@hono/zod-openapi";
import { definePermissionRoute } from "#routes/shared/admin-route";
import { reorderMenus as reorderMenusService } from "#services/menu.service";
import {
  errorSchema,
  reorderMenusBodySchema,
  reorderMenusResponseSchema,
} from "./schema";

export const reorderMenus = definePermissionRoute({
  route: createRoute({
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
      200: {
        content: {
          "application/json": { schema: reorderMenusResponseSchema },
        },
        description: "Updated menus with recalculated sortOrder",
      },
      400: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Invalid items",
      },
    },
  }),
  permission: "menu::reorder",
  handler: async (c) => {
    const body = c.req.valid("json");

    const result = await reorderMenusService(body.items);

    return c.json(result, 200);
  },
});
