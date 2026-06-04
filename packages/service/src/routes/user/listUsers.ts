import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listUsers as listUsersSvc } from "#services/user.service";
import { prepend } from "#utils/list";
import { listUsersQuerySchema, listUsersResponseSchema } from "./schema";

export const listUsers = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("user::list")),
    method: "get",
    path: "/",
    tags: ["AdminUser"],
    summary: "List users with custom roles",
    request: {
      query: listUsersQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listUsersResponseSchema, "List of users"),
    },
  }),
  handler: async (c) => {
    const { limit, offset } = c.req.valid("query");
    const result = await listUsersSvc(limit, offset);
    return c.json(result, 200);
  },
});
