import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import { errorSchema, menuIdParamSchema, menuSchema } from "./schema";

export const getMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Get a menu",
    description: "Returns a single menu by ID.",
    middleware: requireAdmin,
    request: {
      params: menuIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: menuSchema },
        },
        description: "The menu",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");

    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) {
      throw new HTTPException(404, { message: "Menu not found" });
    }

    return c.json(menu, 200);
  },
});
