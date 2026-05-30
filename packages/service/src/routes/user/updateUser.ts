import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { updateUser as updateUserSvc } from "#services/user.service";
import {
  adminUserSchema,
  errorSchema,
  updateUserBodySchema,
  userIdParamSchema,
} from "./schema";

export const updateUser = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["AdminUser"],
    summary: "Update a user with custom roles",
    middleware: requireAdmin,
    request: {
      params: userIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateUserBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: adminUserSchema } },
        description: "Updated user",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "User not found",
      },
      403: {
        content: { "application/json": { schema: errorSchema } },
        description: "Forbidden - cannot change roles of builtin users",
      },
      500: {
        content: { "application/json": { schema: errorSchema } },
        description: "Internal Server Error",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { name, email, password, roleIds } = c.req.valid("json");
    const user = await updateUserSvc(id, { name, email, password, roleIds });
    return c.json(user, 200);
  },
});
