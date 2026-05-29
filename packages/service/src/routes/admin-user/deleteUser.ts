import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { deleteUser as deleteUserSvc } from "../../services/admin-user.service";
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
      403: {
        content: { "application/json": { schema: errorSchema } },
        description: "Forbidden - cannot delete builtin users",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "User not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const result = await deleteUserSvc(id);
    return c.json(result, 200);
  },
});
