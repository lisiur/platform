import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createUser as createUserSvc } from "#modules/identity/user.service";
import { adminUserSchema, createUserBodySchema, errorSchema } from "./schema";

export const createUser = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createUser",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/user:create");
    const { name, email, password, roleIds } = c.req.valid("json");
    const user = await createUserSvc({ name, email, password, roleIds });
    return c.json(user, 200);
  },
});
