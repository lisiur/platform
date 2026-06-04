import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listUserRoles as listUserRolesSvc } from "#services/user-role.service";
import { prepend } from "#utils/list";
import { listUserRolesQuerySchema, userRoleSchema } from "./schema";

export const listUserRoles = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user-role::list")),
    method: "get",
    path: "/",
    tags: ["UserRole"],
    summary: "List roles for a user",
    request: {
      query: listUserRolesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(userRoleSchema.array(), "User roles"),
    },
  }),
  handler: async (c) => {
    const { userId } = c.req.valid("query");
    const userRoles = await listUserRolesSvc(userId);
    return c.json(userRoles, 200);
  },
});
