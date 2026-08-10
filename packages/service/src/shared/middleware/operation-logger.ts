import { createMiddleware } from "hono/factory";
import { resolveRequestSource } from "#lib/internal-request";
import { logOperation } from "#lib/logger";

export const operationLogger = createMiddleware(async (c, next) => {
  const startedAt = Date.now();
  try {
    await next();

    if (shouldSkipOperationLog(c.req.method, c.req.path)) return;

    const statusCode = c.res.status;
    await logOperation({
      level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
      source: resolveRequestSource(c),
      module: getModuleFromPath(c.req.path) ?? undefined,
      event: "http.request",
      message: "Request completed",
      method: c.req.method,
      path: c.req.path,
      statusCode,
      durationMs: Date.now() - startedAt,
      c,
    });
  } catch (error) {
    if (shouldSkipOperationLog(c.req.method, c.req.path)) throw error;

    await logOperation({
      level: "error",
      source: resolveRequestSource(c),
      module: getModuleFromPath(c.req.path) ?? undefined,
      event: "http.request.failed",
      message: "Request failed",
      method: c.req.method,
      path: c.req.path,
      durationMs: Date.now() - startedAt,
      error,
      c,
    });
    throw error;
  }
});

export function shouldSkipOperationLog(method: string, path: string): boolean {
  if (method !== "GET") return false;
  return /^\/api\/(operation-logs|audit-logs)(?:\/[^/]+)?$/.test(path);
}

function getModuleFromPath(path: string): string | null {
  const [, apiSegment, moduleSegment] = path.split("/");
  if (apiSegment !== "api") return null;
  return moduleSegment || null;
}
