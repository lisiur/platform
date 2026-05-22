import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import { createMenuBodySchema, errorSchema, menuSchema } from "./schema";

export const createMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Menu"],
    summary: "Create a menu",
    description:
      "Create a new menu item. If parentId is provided, the menu is nested under that parent.",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": {
            schema: createMenuBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: menuSchema },
        },
        description: "The created menu",
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
        description: "Invalid parentId or duplicate code",
      },
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");

    // Validate parentId belongs to same appId if provided
    if (body.parentId) {
      const parent = await prisma.menu.findFirst({
        where: { id: body.parentId, appId: body.appId },
      });
      if (!parent) {
        throw new HTTPException(400, {
          message: "Parent menu not found in the same application",
        });
      }
    }

    // Auto-calculate sortOrder: max sibling sortOrder + 1
    const maxSort = await prisma.menu.aggregate({
      where: { appId: body.appId, parentId: body.parentId ?? null },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const menu = await prisma.menu.create({
      data: {
        name: body.name,
        code: body.code,
        appId: body.appId,
        parentId: body.parentId,
        icon: body.icon,
        url: body.url,
        sortOrder,
        isExternal: body.isExternal,
        isVisible: body.isVisible,
      },
    });

    return c.json(menu, 201);
  },
});
