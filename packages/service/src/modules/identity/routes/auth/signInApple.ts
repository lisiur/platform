import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getClientIpFromContextOrNull } from "#lib/get-client-ip";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signInWithApple } from "#modules/identity/auth.service";
import { signInAppleBodySchema, signInResponseSchema } from "./schema";

export const signInApple = defineOpenAPIRoute({
  route: createRoute({
    operationId: "signInApple",
    method: "post",
    path: "/sign-in/apple",
    tags: ["Auth"],
    summary: "Sign in (or register) with an Apple identity token",
    description:
      "Verifies a Sign in with Apple id_token (web popup or native app flow), finds or creates the matching user, and opens a session.",
    request: {
      body: {
        content: { "application/json": { schema: signInAppleBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(signInResponseSchema, "Signed in"),
    },
  }),
  handler: async (c) => {
    const { identityToken, nonce, user } = c.req.valid("json");
    const { user: sessionUser, session } = await signInWithApple({
      identityToken,
      nonce,
      user,
      ipAddress: getClientIpFromContextOrNull(c),
      traceId: c.get("traceId"),
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);

    return c.json({ user: sessionUser, session }, 200);
  },
});
