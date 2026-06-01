import { listRoles as listRolesService } from "#services/role.service";
import { defineAdminRoute } from "../shared/admin-route";
import { listRolesQuerySchema, roleSchema } from "./schema";

export const listRoles = defineAdminRoute({
  route: {
    method: "get",
    path: "/",
    tags: ["Role"],
    summary: "List roles for an application",
    request: {
      query: listRolesQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: roleSchema.array() },
        },
        description: "List of roles",
      },
    },
  },
  handler: async (c) => {
    const { appId } = c.req.valid("query");
    const roles = await listRolesService(appId);
    return c.json(roles, 200);
  },
});
