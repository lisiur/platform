import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { createUser as createUserSvc } from "#services/user.service";
import { prepend } from "#utils/list";
import { adminUserSchema, createUserBodySchema, errorSchema } from "./schema";

export const createUser = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user::create")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      500: {
        content: { "application/json": { schema: errorSchema } },
        description: "Internal Server Error",
      },
      ...okResponseFn(adminUserSchema, "Created user"),
    },
  }),
  handler: async (c) => {
    const { name, email, password, roleIds } = c.req.valid("json");
    const user = await createUserSvc({ name, email, password, roleIds });
    return c.json(user, 200);
  },
});
