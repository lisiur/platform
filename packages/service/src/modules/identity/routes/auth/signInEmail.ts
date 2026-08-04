import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getClientIpFromContextOrNull } from "#lib/get-client-ip";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signInWithEmail } from "#modules/identity/auth.service";
import { signInEmailBodySchema, signInResponseSchema } from "./schema";

export const signInEmail = defineOpenAPIRoute({
  route: createRoute({
    operationId: "signInEmail",
    method: "post",
    path: "/sign-in/email",
    tags: ["Auth"],
    summary: "Sign in with email and password",
    request: {
      body: {
        content: { "application/json": { schema: signInEmailBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(signInResponseSchema, "Signed in"),
    },
  }),
  handler: async (c) => {
    const { email, password } = c.req.valid("json");
    const { user, session } = await signInWithEmail({
      email,
      password,
      ipAddress: getClientIpFromContextOrNull(c),
      traceId: c.get("traceId"),
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);

    return c.json({ user, session }, 200);
  },
});
