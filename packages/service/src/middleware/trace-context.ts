import { createMiddleware } from "hono/factory";

export const traceContext = createMiddleware(async (c, next) => {
  const traceId =
    c.req.header("x-trace-id") ??
    c.req.header("x-request-id") ??
    crypto.randomUUID();

  c.set("traceId", traceId);
  await next();
  c.header("x-trace-id", traceId);
});
