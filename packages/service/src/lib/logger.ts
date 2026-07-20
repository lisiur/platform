import type { Context } from "hono";
import { getContext } from "hono/context-storage";
import type { Principal } from "#extractors/session";
import { trySession } from "#extractors/session";
import { prisma } from "#lib/db";
import { getClientIpFromContextOrNull } from "#lib/get-client-ip";

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
  principal?: Principal;
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
    const c = resolveContext(params.c);
    const error = normalizeError(params.error);
    const sessionId = await resolveSessionId(c, params.sessionId);

    await prisma.operationLog.create({
      data: {
        traceId: resolveTraceId(c, params.traceId),
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
    const c = resolveContext(params.c);
    let userId = params.userId;
    let userName = params.userName;
    let sessionId = params.sessionId;
    const principal = params.principal ?? c?.get("principal");

    if (principal?.kind === "user") {
      userId = userId ?? principal.user.id;
      userName = userName ?? principal.user.name;
      sessionId = sessionId ?? principal.session.id;
    } else if (principal?.kind === "token") {
      userId = userId ?? principal.ownerId;
      userName = userName ?? principal.ownerName;
    } else if ((!userId || !sessionId) && c) {
      const session = await trySession(c);
      userId = session?.user?.id;
      userName = session?.user?.name;
      sessionId = session?.session?.id;
    }

    let metadata = toJsonValue(params.metadata);
    if (principal?.kind === "token") {
      metadata = {
        apiTokenId: principal.token.id,
        apiTokenName: principal.token.name,
        ...(metadata ?? {}),
      };
    }

    await prisma.auditLog.create({
      data: {
        traceId: resolveTraceId(c, params.traceId),
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
        metadata,
        ip: c ? getClientIpFromContextOrNull(c) : null,
        userAgent: c ? (c.req.header("user-agent") ?? null) : null,
      },
    });
  } catch (e) {
    console.error("[logAudit] Failed to write audit log:", e);
  }
}

function resolveContext(c?: Context): Context | undefined {
  if (c) return c;
  try {
    return getContext();
  } catch {
    return undefined;
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
