import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { assignUserRole as assignUserRoleSvc } from "#modules/access-control/user-role.service";
import { assignRoleAssignmentBodySchema, roleAssignmentSchema } from "./schema";

export const assignRoleAssignment = defineOpenAPIRoute({
  route: createRoute({
    operationId: "assignRoleAssignment",
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
    await assertAccess(principal, "system/user-role:assign");
    const { roleId, userId } = c.req.valid("json");
    const roleAssignment = await assignUserRoleSvc(userId, roleId);

    logAudit({
      event: "role_assignment.assigned",
      category: "role_assignment",
      metadata: { userId, roleId },
      c,
    });

    return c.json(roleAssignment, 200);
  },
});
