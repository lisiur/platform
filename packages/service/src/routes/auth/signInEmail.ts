import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signInWithEmail } from "#services/auth.service";
import { authMutationResponseSchema, signInEmailBodySchema } from "./schema";

export const signInEmail = defineOpenAPIRoute({
  route: createRoute({
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
      ...okResponseFn(authMutationResponseSchema, "Signed in"),
    },
  }),
  handler: async (c) => {
    const { email, password } = c.req.valid("json");
    const { user, session } = await signInWithEmail({
      email,
      password,
      ipAddress:
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        null,
      traceId: c.get("traceId"),
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);
    return c.json({ data: { user, session }, error: null }, 200);
  },
});
