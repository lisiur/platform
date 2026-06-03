import type { Context } from "hono";
import { trySession } from "#extractors/session";
import { prisma } from "#lib/db";

type OperationLogLevel = "debug" | "info" | "warn" | "error";
type AuditSeverity = "info" | "warning" | "critical";
type AuditOutcome = "success" | "failure" | "denied";

interface LogOperationParams {
  traceId?: string;
  sessionId?: string;
  level?: OperationLogLevel;
  source?: string;
  module?: string;
  event: string;
  message?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: unknown;
  metadata?: unknown;
  c?: Context;
}

interface LogAuditParams {
  traceId?: string;
  sessionId?: string;
  userId?: string;
  userName?: string;
  event: string;
  category: string;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  c?: Context;
}

export async function logOperation(params: LogOperationParams) {
  try {
    const error = normalizeError(params.error);
    const sessionId = await resolveSessionId(params.c, params.sessionId);

    await prisma.operationLog.create({
      data: {
        traceId: resolveTraceId(params.c, params.traceId),
        sessionId: sessionId ?? null,
        level: params.level ?? "info",
        source: params.source ?? null,
        module: params.module ?? null,
        event: params.event,
        message: params.message ?? null,
        method: params.method ?? null,
        path: params.path ?? null,
        statusCode: params.statusCode ?? null,
        durationMs: params.durationMs ?? null,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
        metadata: toJsonValue(params.metadata),
      },
    });
  } catch (e) {
    console.error("[logOperation] Failed to write operation log:", e);
  }
}

export async function logAudit(params: LogAuditParams) {
  try {
    let userId = params.userId;
    let userName = params.userName;
    let sessionId = params.sessionId;

    if ((!userId || !sessionId) && params.c) {
      const session = await trySession(params.c);
      userId = session?.user?.id;
      userName = session?.user?.name;
      sessionId = session?.session?.id;
    }

    await prisma.auditLog.create({
      data: {
        traceId: resolveTraceId(params.c, params.traceId),
        sessionId: sessionId ?? null,
        userId: userId ?? null,
        userName: userName ?? null,
        event: params.event,
        category: params.category,
        severity: params.severity ?? "info",
        outcome: params.outcome ?? "success",
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        targetName: params.targetName ?? null,
        before: toJsonValue(params.before),
        after: toJsonValue(params.after),
        metadata: toJsonValue(params.metadata),
        ip: params.c ? getClientIp(params.c) : null,
        userAgent: params.c
          ? (params.c.req.header("user-agent") ?? null)
          : null,
      },
    });
  } catch (e) {
    console.error("[logAudit] Failed to write audit log:", e);
  }
}

function resolveTraceId(c?: Context, traceId?: string): string {
  return traceId ?? c?.get("traceId") ?? crypto.randomUUID();
}

async function resolveSessionId(c?: Context, sessionId?: string) {
  if (sessionId || !c) return sessionId;
  const session = await trySession(c);
  return session?.session?.id;
}

function normalizeError(error: unknown): {
  name: string | null;
  message: string | null;
  stack: string | null;
} {
  if (!error) return { name: null, message: null, stack: null };
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  return { name: "Error", message: String(error), stack: null };
}

function toJsonValue(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function getClientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
