import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listUsers as listUsersSvc } from "#services/admin-user.service";
import {
  errorSchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
} from "./schema";

export const listUsers = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["AdminUser"],
    summary: "List users with custom roles",
    middleware: requireAdmin,
    request: {
      query: listUsersQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: listUsersResponseSchema } },
        description: "List of users",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { limit, offset } = c.req.valid("query");
    const result = await listUsersSvc(limit, offset);
    return c.json(result, 200);
  },
});
