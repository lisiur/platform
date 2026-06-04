import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { removeUserRole as removeUserRoleSvc } from "#services/user-role.service";
import { prepend } from "#utils/list";
import { removeUserRoleParamSchema, successResponseSchema } from "./schema";

export const removeUserRole = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user-role::remove")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(successResponseSchema, "Removed"),
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
