import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma";
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
  sessionId?: string;
  userId?: string;
  userName?: string;
  event?: string;
  category?: string;
  severity?: string;
  outcome?: string;
  targetType?: string;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    limit = 10,
    offset = 0,
    traceId,
    sessionId,
    userId,
    userName,
    event,
    category,
    severity,
    outcome,
    targetType,
    targetId,
    startDate,
    endDate,
  } = params;

  const where: Prisma.AuditLogWhereInput = {};
  if (traceId) where.traceId = traceId;
  if (sessionId) where.sessionId = sessionId;
  if (userId) where.userId = userId;
  if (userName) where.userName = { contains: userName, mode: "insensitive" };
  if (event) where.event = event;
  if (category) where.category = category;
  if (severity) where.severity = severity;
  if (outcome) where.outcome = outcome;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
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
