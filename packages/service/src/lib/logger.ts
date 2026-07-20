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
  authType?: "session" | "api_token" | null;
  authTokenId?: string;
  principal?: Principal;
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
  authType?: "session" | "api_token" | null;
  authTokenId?: string;
  userId?: string;
  userName?: string;
  source?: string;
  principal?: Principal;
  event: string;
  category: string;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  c?: Context;
}

export async function logOperation(params: LogOperationParams) {
  try {
    const c = resolveContext(params.c);
    const error = normalizeError(params.error);
    const { authType, authTokenId } = await resolveAuth(c, {
      authType: params.authType,
      authTokenId: params.authTokenId,
      principal: params.principal,
    });

    await prisma.operationLog.create({
      data: {
        traceId: resolveTraceId(c, params.traceId),
        authType,
        authTokenId,
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
    const auth = await resolveAuth(c, params);
    const userId = auth.userId ?? params.userId;
    const userName = auth.userName ?? params.userName;

    const source =
      params.source ?? (c ? `${c.req.method} ${c.req.path}` : null);

    await prisma.auditLog.create({
      data: {
        traceId: resolveTraceId(c, params.traceId),
        authType: auth.authType,
        authTokenId: auth.authTokenId,
        userId: userId ?? null,
        userName: userName ?? null,
        source,
        event: params.event,
        category: params.category,
        severity: params.severity ?? "info",
        outcome: params.outcome ?? "success",
        before: toJsonValue(params.before),
        after: toJsonValue(params.after),
        metadata: toJsonValue(params.metadata),
        ip: c ? getClientIpFromContextOrNull(c) : null,
        userAgent: c ? (c.req.header("user-agent") ?? null) : null,
      },
    });
  } catch (e) {
    console.error("[logAudit] Failed to write audit log:", e);
  }
}

async function resolveAuth(
  c: Context | undefined,
  params: {
    authType?: "session" | "api_token" | null;
    authTokenId?: string;
    principal?: Principal;
    userId?: string;
    userName?: string;
  },
): Promise<{
  authType: string | null;
  authTokenId: string | null;
  userId?: string;
  userName?: string;
}> {
  let authType = params.authType ?? undefined;
  let authTokenId = params.authTokenId;
  let userId = params.userId;
  let userName = params.userName;
  const principal = params.principal ?? c?.get("principal");

  if (principal?.kind === "user") {
    authType = authType ?? "session";
    authTokenId = authTokenId ?? principal.session.id;
    userId = userId ?? principal.user.id;
    userName = userName ?? principal.user.name;
  } else if (principal?.kind === "token") {
    authType = authType ?? "api_token";
    authTokenId = authTokenId ?? principal.token.id;
    userId = userId ?? principal.ownerId;
    userName = userName ?? principal.ownerName;
  } else if (!authTokenId && c) {
    const session = await trySession(c);
    if (session) {
      authType = authType ?? "session";
      authTokenId = authTokenId ?? session.session.id;
      userId = userId ?? session.user.id;
      userName = userName ?? session.user.name;
    }
  }

  return {
    authType: authType ?? null,
    authTokenId: authTokenId ?? null,
    userId,
    userName,
  };
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
