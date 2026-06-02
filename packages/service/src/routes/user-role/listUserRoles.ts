import { listUserRoles as listUserRolesSvc } from "#services/user-role.service";
import { definePermissionRoute } from "../shared/admin-route";
import { listUserRolesQuerySchema, userRoleSchema } from "./schema";

export const listUserRoles = definePermissionRoute({
  permission: "user-role::list",
  route: {
    method: "get",
    path: "/",
    tags: ["UserRole"],
    summary: "List roles for a user",
    request: {
      query: listUserRolesQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: userRoleSchema.array() } },
        description: "User roles",
      },
    },
  },
  handler: async (c) => {
    const { userId } = c.req.valid("query");
    const userRoles = await listUserRolesSvc(userId);
    return c.json(userRoles, 200);
  },
});
