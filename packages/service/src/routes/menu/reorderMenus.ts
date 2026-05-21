import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../../lib/db";
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
    const itemIds = body.items.map((i) => i.id);

    // Verify all items exist
    const existingMenus = await prisma.menu.findMany({
      where: { id: { in: itemIds } },
    });

    if (existingMenus.length !== itemIds.length) {
      throw new HTTPException(400, {
        message: "One or more menu items not found",
      });
    }

    // Collect all unique parentIds affected (old + new)
    const affectedParentIds = new Set<string | null>();
    for (const item of body.items) {
      const existing = existingMenus.find((m) => m.id === item.id)!;
      if (existing.parentId !== item.parentId) {
        affectedParentIds.add(existing.parentId);
      }
      affectedParentIds.add(item.parentId);
    }

    // Update all items atomically in a transaction
    const updatedMenus = await prisma.$transaction(async (tx) => {
      // Apply each item's new position
      for (const item of body.items) {
        await tx.menu.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            parentId: item.parentId,
          },
        });
      }

      // Recalculate sortOrder for all affected parent groups
      // Group items by parentId, then re-index them
      const allMenus = await tx.menu.findMany({
        where: {
          OR: [...affectedParentIds].map((pid) => ({
            parentId: pid,
          })),
        },
        orderBy: { sortOrder: "asc" },
      });

      // Group by parentId
      const groups = new Map<string | null, typeof allMenus>();
      for (const menu of allMenus) {
        const key = menu.parentId ?? null;
        const group = groups.get(key) || [];
        group.push(menu);
        groups.set(key, group);
      }

      // Re-index each group sequentially
      for (const [, group] of groups) {
        for (let i = 0; i < group.length; i++) {
          if (group[i].sortOrder !== i) {
            await tx.menu.update({
              where: { id: group[i].id },
              data: { sortOrder: i },
            });
          }
        }
      }

      // Return all updated menus for the app
      const appId = existingMenus[0].appId;
      return tx.menu.findMany({
        where: { appId },
        orderBy: { sortOrder: "asc" },
      });
    });

    return c.json({ menus: updatedMenus }, 200);
  },
});
