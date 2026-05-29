import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { removeUserRole as removeUserRoleSvc } from "#services/user-role.service";
import { removeUserRoleParamSchema, successResponseSchema } from "./schema";

export const removeUserRole = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/remove",
    tags: ["UserRole"],
    summary: "Remove a role from a user",
    middleware: requireAdmin,
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
  }),
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
