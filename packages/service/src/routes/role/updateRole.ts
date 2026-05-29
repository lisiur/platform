import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { updateRole as updateRoleService } from "#services/role.service";
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
    const updated = await updateRoleService(id, data);

    logAudit({
      event: "role.updated",
      category: "role",
      targetId: id,
      targetName: updated.name,
      c,
    });

    return c.json(updated, 200);
  },
});
