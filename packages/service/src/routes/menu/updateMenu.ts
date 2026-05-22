import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/middleware/require-admin";
import {
  errorSchema,
  menuIdParamSchema,
  menuSchema,
  updateMenuBodySchema,
} from "./schema";

export const updateMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Update a menu",
    description: "Update a menu by ID.",
    middleware: requireAdmin,
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
      200: {
        content: {
          "application/json": { schema: menuSchema },
        },
        description: "The updated menu",
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
    const body = c.req.valid("json");

    const existing = await prisma.menu.findUnique({ where: { id } });
    if (!existing) {
      throw new HTTPException(404, { message: "Menu not found" });
    }

    const menu = await prisma.menu.update({
      where: { id },
      data: body,
    });

    return c.json(menu, 200);
  },
});
