import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { roleRepository } from "#repositories/role.repository";
import { errorSchema, listRolesQuerySchema, roleSchema } from "./schema";

export const listRoles = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Role"],
    summary: "List roles for an application",
    middleware: requireAdmin,
    request: {
      query: listRolesQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: roleSchema.array() },
        },
        description: "List of roles",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { appId } = c.req.valid("query");
    const roles = await roleRepository.findByAppId(appId);
    return c.json(roles, 200);
  },
});
