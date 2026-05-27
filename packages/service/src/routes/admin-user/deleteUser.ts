import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { prisma } from "#lib/db";
import { assertUserIsNotBuiltin } from "#lib/protected-user";
import { requireAdmin } from "#middleware/require-admin";
import { errorSchema, successSchema, userIdParamSchema } from "./schema";

export const deleteUser = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["AdminUser"],
    summary: "Delete a user",
    middleware: requireAdmin,
    request: {
      params: userIdParamSchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: successSchema } },
        description: "User deleted",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "User not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");

    await assertUserIsNotBuiltin(id);

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return c.json({ code: 404, message: "User not found" }, 404);
    }

    // Delete user directly via Prisma (cascading deletes handle related records)
    await prisma.user.delete({ where: { id } });

    return c.json({ success: true }, 200);
  },
});
