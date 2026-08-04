import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { resetPassword as resetPasswordSvc } from "#modules/identity/user.service";
import {
  resetPasswordBodySchema,
  successSchema,
  userIdParamSchema,
} from "./schema";

export const resetPassword = defineOpenAPIRoute({
  route: createRoute({
    operationId: "resetPassword",
    method: "post",
    path: "/{id}/reset-password",
    tags: ["AdminUser"],
    summary: "Reset a user's password",
    request: {
      params: userIdParamSchema,
      body: {
        content: {
          "application/json": { schema: resetPasswordBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "Password reset"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/user:update");
    const { id } = c.req.valid("param");
    const { password } = c.req.valid("json");
    await resetPasswordSvc(id, password, {
      traceId: c.get("traceId"),
      actorId: getPrincipalUserId(principal),
      actorSessionId:
        principal.kind === "user" ? principal.session.id : undefined,
    });
    return c.json({ success: true }, 200);
  },
});
