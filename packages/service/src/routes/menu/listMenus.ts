import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/middleware/require-admin";
import {
  errorSchema,
  listMenusQuerySchema,
  listMenusResponseSchema,
} from "./schema";

export const listMenus = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Menu"],
    summary: "List menus",
    description:
      "Returns a flat list of menus for the given appId, sorted by sortOrder.",
    middleware: requireAdmin,
    request: {
      query: listMenusQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listMenusResponseSchema,
          },
        },
        description: "Flat list of menus",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { appId } = c.req.valid("query");

    const menus = await prisma.menu.findMany({
      where: { appId },
      orderBy: { sortOrder: "asc" },
    });

    return c.json({ menus }, 200);
  },
});
