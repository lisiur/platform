import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { reorderMenus as reorderMenusService } from "../../services/menu.service";
import { errorSchema, menuSchema } from "./schema";

export const reorderMenusBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).openapi({ example: "clx1234567890" }),
        parentId: z.string().nullable().openapi({ example: null }),
        sortOrder: z.number().int().min(0).openapi({ example: 0 }),
      }),
    )
    .min(1)
    .openapi({ description: "Array of menu items with updated positions" }),
});

export const reorderMenusResponseSchema = z
  .object({
    menus: menuSchema.array(),
  })
  .openapi("ReorderMenusResponse");

export const reorderMenus = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/reorder",
    tags: ["Menu"],
    summary: "Reorder menus",
    description:
      "Batch update menu positions after drag-and-drop. Recalculates sortOrder for all siblings atomically.",
    middleware: requireAdmin,
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
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      400: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Invalid items",
      },
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");

    const result = await reorderMenusService(body.items);

    return c.json(result, 200);
  },
});
