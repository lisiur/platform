import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { assignUserRole as assignUserRoleSvc } from "#services/user-role.service";
import { prepend } from "#utils/list";
import { assignUserRoleBodySchema, userRoleSchema } from "./schema";

export const assignUserRole = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user-role::assign")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(userRoleSchema, "Assigned user role"),
    },
  }),
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
