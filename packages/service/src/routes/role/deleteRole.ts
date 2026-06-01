import { logAudit } from "#lib/logger";
import { deleteRole as deleteRoleService } from "#services/role.service";
import { defineAdminRoute } from "../shared/admin-route";
import { errorSchema, roleIdParamSchema, successSchema } from "./schema";

export const deleteRole = defineAdminRoute({
  route: {
    method: "delete",
    path: "/{id}",
    tags: ["Role"],
    summary: "Delete a role",
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: successSchema },
        },
        description: "Deleted",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not Found",
      },
    },
  },
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { name } = await deleteRoleService(id);

    logAudit({
      event: "role.deleted",
      category: "role",
      targetId: id,
      targetName: name,
      c,
    });

    return c.json({ success: true }, 200);
  },
});
