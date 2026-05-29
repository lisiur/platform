import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { changePassword as changePasswordService } from "#services/auth.service";
import {
  authMutationResponseSchema,
  changePasswordBodySchema,
  errorSchema,
} from "./schema";

export const changePassword = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/change-password",
    tags: ["Auth"],
    summary: "Change current user password",
    request: {
      body: {
        content: { "application/json": { schema: changePasswordBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: authMutationResponseSchema } },
        description: "Password changed",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Unauthorized",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Invalid current password",
      },
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const { user } = await changePasswordService({
      headers: c.req.raw.headers,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });

    return c.json({ data: { user }, error: null }, 200);
  },
});
