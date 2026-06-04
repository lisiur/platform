import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { badRequestResponse, okResponseFn } from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signUpWithEmail } from "#services/auth.service";
import { authMutationResponseSchema, signUpEmailBodySchema } from "./schema";

export const signUpEmail = defineOpenAPIRoute({
  route: createRoute({
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
      ...okResponseFn(authMutationResponseSchema, "Signed up"),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const { user, session } = await signUpWithEmail({
      ...body,
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
