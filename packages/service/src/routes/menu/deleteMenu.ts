import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../../lib/db";
import { deleteSuccessSchema, errorSchema, menuIdParamSchema } from "./schema";

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
      200: {
        content: {
          "application/json": { schema: deleteSuccessSchema },
        },
        description: "Successfully deleted",
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

    const existing = await prisma.menu.findUnique({ where: { id } });
    if (!existing) {
      throw new HTTPException(404, { message: "Menu not found" });
    }

    await prisma.menu.delete({ where: { id } });

    return c.json({ success: true as const }, 200);
  },
});
