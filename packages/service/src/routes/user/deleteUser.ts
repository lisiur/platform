import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteUser as deleteUserSvc } from "#services/user.service";
import { prepend } from "#utils/list";
import { successSchema, userIdParamSchema } from "./schema";

export const deleteUser = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user::delete")),
    method: "delete",
    path: "/{id}",
    tags: ["AdminUser"],
    summary: "Delete a user",
    request: {
      params: userIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "User deleted"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const result = await deleteUserSvc(id);
    return c.json(result, 200);
  },
});
