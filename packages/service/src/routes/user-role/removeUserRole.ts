import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { userRoleRepository } from "#repositories/user-role.repository";

const removeBodySchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

const successSchema = z.object({
  success: z.boolean(),
});

export const removeUserRole = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/remove",
    tags: ["UserRole"],
    summary: "Remove a role from a user",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": { schema: removeBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: successSchema },
        },
        description: "Removed",
      },
    },
  }),
  handler: async (c) => {
    const { userId, roleId } = c.req.valid("json");
    await userRoleRepository.remove(userId, roleId);
    return c.json({ success: true }, 200);
  },
});
