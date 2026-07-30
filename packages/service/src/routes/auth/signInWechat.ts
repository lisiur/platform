import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getClientIpFromContextOrNull } from "#lib/get-client-ip";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import { signInWithWechat } from "#services/auth.service";
import { signInResponseSchema, signInWechatBodySchema } from "./schema";

export const signInWechat = defineOpenAPIRoute({
  route: createRoute({
    operationId: "signInWechat",
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
      ...okResponseFn(signInResponseSchema, "Signed in"),
    },
  }),
  handler: async (c) => {
    const { code } = c.req.valid("json");
    const { user, session } = await signInWithWechat({
      code,
      ipAddress: getClientIpFromContextOrNull(c),
      traceId: c.get("traceId"),
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);

    return c.json({ user, session }, 200);
  },
});
