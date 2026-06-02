import { createUser as createUserSvc } from "#services/user.service";
import { definePermissionRoute } from "../shared/admin-route";
import { adminUserSchema, createUserBodySchema, errorSchema } from "./schema";

export const createUser = definePermissionRoute({
  permission: "user::create",
  route: {
    method: "post",
    path: "/",
    tags: ["AdminUser"],
    summary: "Create a user with custom roles",
    request: {
      body: {
        content: {
          "application/json": { schema: createUserBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: adminUserSchema } },
        description: "Created user",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
      500: {
        content: { "application/json": { schema: errorSchema } },
        description: "Internal Server Error",
      },
    },
  },
  handler: async (c) => {
    const { name, email, password, roleIds } = c.req.valid("json");
    const user = await createUserSvc({ name, email, password, roleIds });
    return c.json(user, 200);
  },
});
