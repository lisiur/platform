import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { userRoleRepository } from "#repositories/user-role.repository";
import {
  assignUserRoleBodySchema,
  errorSchema,
  userRoleSchema,
} from "./schema";

export const assignUserRole = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["UserRole"],
    summary: "Assign a role to a user",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": { schema: assignUserRoleBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: userRoleSchema } },
        description: "Assigned user role",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
    },
  }),
  handler: async (c) => {
    const { userId, roleId } = c.req.valid("json");
    const userRole = await userRoleRepository.assign(userId, roleId);
    return c.json(userRole, 200);
  },
});
