import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#services/role-permission.service";
import { removeUserRole as removeUserRoleSvc } from "#services/user-role.service";
import {
  removeRoleAssignmentParamSchema,
  successResponseSchema,
} from "./schema";

export const removeRoleAssignment = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/remove",
    tags: ["RoleAssignment"],
    summary: "Remove a role from a user",
    request: {
      body: {
        content: {
          "application/json": { schema: removeRoleAssignmentParamSchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(successResponseSchema, "Removed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/user-role:remove");
    const { roleId, userId } = c.req.valid("json");
    await removeUserRoleSvc(userId, roleId);

    logAudit({
      event: "role_assignment.removed",
      category: "role_assignment",
      metadata: { userId, roleId },
      c,
    });

    return c.json({ success: true }, 200);
  },
});
