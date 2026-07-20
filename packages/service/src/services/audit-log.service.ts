import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export async function getAuditLogById(id: string) {
  const log = await prisma.auditLog.findUnique({ where: { id } });
  if (!log) {
    throw new HTTPException(404, { message: "Audit log not found" });
  }
  return log;
}

export async function listAuditLogs(params: {
  limit?: number;
  offset?: number;
  traceId?: string;
  authType?: string;
  authTokenId?: string;
  userId?: string;
  userName?: string;
  source?: string;
  event?: string;
  category?: string;
  severity?: string;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    limit = 10,
    offset = 0,
    traceId,
    authType,
    authTokenId,
    userId,
    userName,
    source,
    event,
    category,
    severity,
    outcome,
    startDate,
    endDate,
  } = params;

  const where: Prisma.AuditLogWhereInput = {};
  if (traceId) where.traceId = traceId;
  if (authType) where.authType = authType;
  if (authTokenId) where.authTokenId = authTokenId;
  if (userId) where.userId = userId;
  if (userName) where.userName = { contains: userName, mode: "insensitive" };
  if (source) where.source = { contains: source, mode: "insensitive" };
  if (event) where.event = event;
  if (category) where.category = category;
  if (severity) where.severity = severity;
  if (outcome) where.outcome = outcome;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Prisma.DateTimeFilter).gte = startDate;
    if (endDate) (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
