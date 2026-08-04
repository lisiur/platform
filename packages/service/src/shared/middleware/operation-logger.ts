import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { logOperation } from "#lib/logger";

/**
 * Classifies a request's origin for the operation-log `source` field:
 *   agent   — AI Agent `call_api` tool (x-internal-token matches AGENT_API_TOKEN)
 *   ssr     — server-side render request (x-internal-token matches SSR_API_TOKEN)
 *   browser — any other client
 */
function resolveSource(c: Context): "agent" | "ssr" | "browser" {
  const token = c.req.header("x-internal-token");
  if (
    token &&
    process.env.AGENT_API_TOKEN &&
    token === process.env.AGENT_API_TOKEN
  )
    return "agent";
  if (token && process.env.SSR_API_TOKEN && token === process.env.SSR_API_TOKEN)
    return "ssr";
  return "browser";
}

export const operationLogger = createMiddleware(async (c, next) => {
  const startedAt = Date.now();
  try {
    await next();

    if (shouldSkipOperationLog(c.req.method, c.req.path)) return;

    const statusCode = c.res.status;
    await logOperation({
      level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
      source: resolveSource(c),
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
      source: resolveSource(c),
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
