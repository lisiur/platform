import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { updateRole as updateRoleService } from "#services/role.service";
import { prepend } from "#utils/list";
import {
  errorSchema,
  roleIdParamSchema,
  roleSchema,
  updateRoleBodySchema,
} from "./schema";

export const updateRole = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("role::update")),
    method: "put",
    path: "/{id}",
    tags: ["Role"],
    summary: "Update a role",
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not Found",
      },
      ...okResponseFn(roleSchema, "Updated role"),
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
