import { createMiddleware } from "hono/factory";

const TRACE_ID_RE = /^[0-9a-f-]{8,64}$/i;

export function resolveTraceId(header: string | undefined): string {
  return header && TRACE_ID_RE.test(header) ? header : crypto.randomUUID();
}

export const traceContext = createMiddleware(async (c, next) => {
  const traceId = resolveTraceId(
    c.req.header("x-trace-id") ?? c.req.header("x-request-id"),
  );

  c.set("traceId", traceId);
  await next();
  c.header("x-trace-id", traceId);
});
