import { listUsers as listUsersSvc } from "#services/user.service";
import { definePermissionRoute } from "../shared/admin-route";
import { listUsersQuerySchema, listUsersResponseSchema } from "./schema";

export const listUsers = definePermissionRoute({
  permission: "user::list",
  route: {
    method: "get",
    path: "/",
    tags: ["AdminUser"],
    summary: "List users with custom roles",
    request: {
      query: listUsersQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: listUsersResponseSchema } },
        description: "List of users",
      },
    },
  },
  handler: async (c) => {
    const { limit, offset } = c.req.valid("query");
    const result = await listUsersSvc(limit, offset);
    return c.json(result, 200);
  },
});
