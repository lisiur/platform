import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listUserRoles as listUserRolesSvc } from "#services/user-role.service";
import { listUserRolesQuerySchema, userRoleSchema } from "./schema";

export const listUserRoles = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["UserRole"],
    summary: "List roles for a user",
    middleware: requireAdmin,
    request: {
      query: listUserRolesQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: userRoleSchema.array() } },
        description: "User roles",
      },
    },
  }),
  handler: async (c) => {
    const { userId } = c.req.valid("query");
    const userRoles = await listUserRolesSvc(userId);
    return c.json(userRoles, 200);
  },
});
