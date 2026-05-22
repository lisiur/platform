import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthType } from "@/lib/auth";
import { auth } from "@/lib/auth";

const authRoutes = new OpenAPIHono<{ Bindings: AuthType }>({ strict: false });

authRoutes.on(["POST", "GET"], "/*", (c) => {
  return auth.handler(c.req.raw);
});

export { authRoutes };
