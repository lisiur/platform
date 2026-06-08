import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signInWithWechat } from "#services/auth.service";
import { createNotificationsFromTemplate } from "#services/notification/notification.service";
import { authMutationResponseSchema, signInWechatBodySchema } from "./schema";

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
      ...unauthorizedResponse,
      ...okResponseFn(authMutationResponseSchema, "Signed in"),
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

    createNotificationsFromTemplate({
      templateKey: "welcome",
      recipientUserIds: [user.id],
      variables: { userName: user.name },
      source: "auth",
    }).catch(() => null);

    return c.json({ data: { user, session }, error: null }, 200);
  },
});
