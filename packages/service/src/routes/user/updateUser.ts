import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { updateUser as updateUserSvc } from "#services/user.service";
import { prepend } from "#utils/list";
import {
  adminUserSchema,
  updateUserBodySchema,
  userIdParamSchema,
} from "./schema";

export const updateUser = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user::update")),
    method: "put",
    path: "/{id}",
    tags: ["AdminUser"],
    summary: "Update a user with custom roles",
    request: {
      params: userIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateUserBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(adminUserSchema, "Updated user"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { name, email, password, roleIds } = c.req.valid("json");
    const user = await updateUserSvc(id, { name, email, password, roleIds });
    return c.json(user, 200);
  },
});
