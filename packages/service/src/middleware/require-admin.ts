import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";

export const requireAdmin = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || session.user.role !== "admin") {
    throw new HTTPException(401, { message: "Admin access required" });
  }
  return next();
});
