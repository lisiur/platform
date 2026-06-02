import { logAudit } from "#lib/logger";
import { removeUserRole as removeUserRoleSvc } from "#services/user-role.service";
import { definePermissionRoute } from "../shared/admin-route";
import { removeUserRoleParamSchema, successResponseSchema } from "./schema";

export const removeUserRole = definePermissionRoute({
  permission: "user-role::remove",
  route: {
    method: "post",
    path: "/remove",
    tags: ["UserRole"],
    summary: "Remove a role from a user",
    request: {
      body: {
        content: {
          "application/json": { schema: removeUserRoleParamSchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: successResponseSchema },
        },
        description: "Removed",
      },
    },
  },
  handler: async (c) => {
    const { userId, roleId } = c.req.valid("json");
    await removeUserRoleSvc(userId, roleId);

    logAudit({
      event: "user_role.removed",
      category: "user_role",
      metadata: { userId, roleId },
      c,
    });

    return c.json({ success: true }, 200);
  },
});
