import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma";
import { prisma } from "#lib/db";

export async function getLogById(id: string) {
  const log = await prisma.operationLog.findUnique({ where: { id } });
  if (!log) {
    throw new HTTPException(404, { message: "Log not found" });
  }
  return log;
}

export async function listLogs(params: {
  limit?: number;
  offset?: number;
  traceId?: string;
  sessionId?: string;
  level?: string;
  source?: string;
  module?: string;
  event?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    limit = 10,
    offset = 0,
    traceId,
    sessionId,
    level,
    source,
    module,
    event,
    method,
    path,
    statusCode,
    startDate,
    endDate,
  } = params;

  const where: Prisma.OperationLogWhereInput = {};
  if (traceId) where.traceId = traceId;
  if (sessionId) where.sessionId = sessionId;
  if (level) where.level = level;
  if (source) where.source = source;
  if (module) where.module = module;
  if (event) where.event = event;
  if (method) where.method = method;
  if (path) where.path = { contains: path, mode: "insensitive" };
  if (statusCode) where.statusCode = statusCode;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Prisma.DateTimeFilter).gte = startDate;
    if (endDate) (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.operationLog.count({ where }),
  ]);

  return { logs, total };
}

export async function deleteLogs(ids: string[]) {
  await prisma.operationLog.deleteMany({
    where: { id: { in: ids } },
  });
}
