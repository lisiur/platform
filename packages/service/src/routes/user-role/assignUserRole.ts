import { logAudit } from "#lib/logger";
import { assignUserRole as assignUserRoleSvc } from "#services/user-role.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  assignUserRoleBodySchema,
  errorSchema,
  userRoleSchema,
} from "./schema";

export const assignUserRole = definePermissionRoute({
  permission: "user-role::assign",
  route: {
    method: "post",
    path: "/",
    tags: ["UserRole"],
    summary: "Assign a role to a user",
    request: {
      body: {
        content: {
          "application/json": { schema: assignUserRoleBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: userRoleSchema } },
        description: "Assigned user role",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
    },
  },
  handler: async (c) => {
    const { userId, roleId } = c.req.valid("json");
    const userRole = await assignUserRoleSvc(userId, roleId);

    logAudit({
      event: "user_role.assigned",
      category: "user_role",
      targetId: userRole.id,
      metadata: { userId, roleId },
      c,
    });

    return c.json(userRole, 200);
  },
});
