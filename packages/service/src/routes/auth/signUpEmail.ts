import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { setSessionCookie } from "#lib/session";
import { signUpWithEmail } from "#services/auth.service";
import {
  authMutationResponseSchema,
  errorSchema,
  signUpEmailBodySchema,
} from "./schema";

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
      200: {
        content: { "application/json": { schema: authMutationResponseSchema } },
        description: "Signed up",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Email already exists",
      },
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
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);
    return c.json({ data: { user, session }, error: null }, 200);
  },
});
