import { logAudit } from "#lib/logger";
import { updateRole as updateRoleService } from "#services/role.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  errorSchema,
  roleIdParamSchema,
  roleSchema,
  updateRoleBodySchema,
} from "./schema";

export const updateRole = definePermissionRoute({
  permission: "role::update",
  route: {
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
      200: {
        content: { "application/json": { schema: roleSchema } },
        description: "Updated role",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not Found",
      },
    },
  },
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
