import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/current-app";
import { getClientIpFromContextOrNull } from "#lib/get-client-ip";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
} from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signUpWithEmail } from "#services/auth.service";
import { signInResponseSchema, signUpEmailBodySchema } from "./schema";

export const signUpEmail = defineOpenAPIRoute({
  route: createRoute({
    operationId: "signUpEmail",
    method: "post",
    path: "/sign-up/email",
    tags: ["Auth"],
    summary: "Create a user with email and password",
    request: {
      body: {
        content: { "application/json": { schema: signUpEmailBodySchema } },
        required: true,
      },
    },
    responses: {
      ...badRequestResponse,
      ...forbiddenResponse,
      ...createdResponseFn(signInResponseSchema, "Signed up"),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const appId = await requireAppId(c);
    const { user, session } = await signUpWithEmail({
      ...body,
      appId,
      ipAddress: getClientIpFromContextOrNull(c),
      traceId: c.get("traceId"),
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);
    return c.json({ user, session }, 201);
  },
});
