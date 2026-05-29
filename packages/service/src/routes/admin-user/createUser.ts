import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { createUser as createUserSvc } from "#services/admin-user.service";
import { adminUserSchema, createUserBodySchema, errorSchema } from "./schema";

export const createUser = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["AdminUser"],
    summary: "Create a user with custom roles",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": { schema: createUserBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: adminUserSchema } },
        description: "Created user",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
      500: {
        content: { "application/json": { schema: errorSchema } },
        description: "Internal Server Error",
      },
    },
  }),
  handler: async (c) => {
    const { name, email, password, roleIds } = c.req.valid("json");
    const user = await createUserSvc({ name, email, password, roleIds });
    return c.json(user, 200);
  },
});
