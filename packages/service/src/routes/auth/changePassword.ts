import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  badRequestResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { changePassword as changePasswordService } from "#services/auth.service";
import { authMutationResponseSchema, changePasswordBodySchema } from "./schema";

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
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...okResponseFn(authMutationResponseSchema, "Password changed"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const body = c.req.valid("json");
    const { user } = await changePasswordService({
      userId: session.user.id,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });

    return c.json({ data: { user }, error: null }, 200);
  },
});
