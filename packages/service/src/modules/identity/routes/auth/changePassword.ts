import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { changePassword as changePasswordService } from "#modules/identity/auth.service";
import { changePasswordBodySchema, userMutationResponseSchema } from "./schema";

export const changePassword = defineOpenAPIRoute({
  route: createRoute({
    operationId: "changePassword",
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
      ...okResponseFn(userMutationResponseSchema, "Password changed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    if (principal.kind !== "user") {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const body = c.req.valid("json");
    const { user, session } = await changePasswordService({
      userId: getPrincipalUserId(principal),
      callerSessionId: principal.session.id,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      traceId: c.get("traceId"),
    });

    setSessionCookie(c, session.token);
    return c.json({ user }, 200);
  },
});
