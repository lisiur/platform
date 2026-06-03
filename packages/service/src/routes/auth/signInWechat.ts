import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { setSessionCookie } from "#lib/session";
import { signInWithWechat } from "#services/auth.service";
import {
  authMutationResponseSchema,
  errorSchema,
  signInWechatBodySchema,
} from "./schema";

export const signInWechat = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/sign-in/wechat",
    tags: ["Auth"],
    summary: "Sign in with WeChat Mini Program code",
    request: {
      body: {
        content: { "application/json": { schema: signInWechatBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: authMutationResponseSchema } },
        description: "Signed in",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Invalid WeChat code",
      },
    },
  }),
  handler: async (c) => {
    const { code } = c.req.valid("json");
    const { user, session } = await signInWithWechat({
      code,
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
