import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteRole as deleteRoleService } from "#services/role.service";
import { assertAccess } from "#services/role-permission.service";
import { errorSchema, roleIdParamSchema, successSchema } from "./schema";

export const deleteRole = defineOpenAPIRoute({
  route: createRoute({
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "role::delete");
    const { id } = c.req.valid("param");
    await deleteRoleService(id);

    logAudit({
      event: "role.deleted",
      category: "role",
      c,
    });

    return c.json({ success: true }, 200);
  },
});
