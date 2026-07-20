import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#services/role-permission.service";
import { assignUserRole as assignUserRoleSvc } from "#services/user-role.service";
import { assignRoleAssignmentBodySchema, roleAssignmentSchema } from "./schema";

export const assignRoleAssignment = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["RoleAssignment"],
    summary: "Assign a role to a user",
    request: {
      body: {
        content: {
          "application/json": { schema: assignRoleAssignmentBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(roleAssignmentSchema, "Assigned role assignment"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "user-role::assign");
    const { roleId, organizationId, userId } = c.req.valid("json");
    const roleAssignment = await assignUserRoleSvc(userId, roleId, {
      organizationId,
    });

    logAudit({
      event: "role_assignment.assigned",
      category: "role_assignment",
      metadata: { userId, roleId, organizationId },
      c,
    });

    return c.json(roleAssignment, 200);
  },
});
