import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteRole as deleteRoleService } from "#services/role.service";
import { prepend } from "#utils/list";
import { errorSchema, roleIdParamSchema, successSchema } from "./schema";

export const deleteRole = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("role::delete")),
    method: "delete",
    path: "/{id}",
    tags: ["Role"],
    summary: "Delete a role",
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not Found",
      },
      ...okResponseFn(successSchema, "Deleted"),
    },
  }),
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
