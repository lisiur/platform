import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "@/middleware/require-admin";
import { roleRepository } from "@/repositories/role.repository";
import { createRoleBodySchema, errorSchema, roleSchema } from "./schema";

export const createRole = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Role"],
    summary: "Create a role",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": { schema: createRoleBodySchema },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: roleSchema } },
        description: "Created role",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
    },
  }),
  handler: async (c) => {
    const data = c.req.valid("json");
    const existing = await roleRepository.findByAppAndCode(
      data.appId,
      data.code,
    );
    if (existing) {
      return c.json(
        { code: 400, message: "Role code already exists in this application" },
        400,
      );
    }
    const role = await roleRepository.create(data);
    return c.json(role, 201);
  },
});
