import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { roleRepository } from "#repositories/role.repository";
import {
  errorSchema,
  roleIdParamSchema,
  roleSchema,
  updateRoleBodySchema,
} from "./schema";

export const updateRole = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Role"],
    summary: "Update a role",
    middleware: requireAdmin,
    request: {
      params: roleIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateRoleBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: roleSchema } },
        description: "Updated role",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not Found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const role = await roleRepository.findById(id);
    if (!role) {
      return c.json({ code: 404, message: "Role not found" }, 404);
    }
    const updated = await roleRepository.update(id, data);
    return c.json(updated, 200);
  },
});
