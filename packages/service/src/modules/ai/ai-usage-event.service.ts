import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

type UsageEventRow = Prisma.AiUsageEventGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } };
    agent: { select: { id: true; name: true; code: true } };
    model: { select: { id: true; displayName: true; modelId: true } };
    account: { select: { id: true; name: true } };
  };
}>;

function serialize(event: UsageEventRow) {
  const { cost, ...rest } = event;
  return {
    ...rest,
    cost: Number(cost),
  };
}

export async function listAiUsageEvents(params: {
  search?: string;
  userId?: string;
  agentId?: string;
  modelId?: string;
  accountId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    search,
    userId,
    agentId,
    modelId,
    accountId,
    status,
    startDate,
    endDate,
    limit = 10,
    offset = 0,
  } = params;

  const where: Prisma.AiUsageEventWhereInput = {};
  if (userId) where.userId = userId;
  if (agentId) where.agentId = agentId;
  if (modelId) where.modelId = modelId;
  if (accountId) where.accountId = accountId;
  if (status) where.status = status;
  if (startDate || endDate) {
    where.createdAt = {
      gte: startDate ? new Date(startDate) : undefined,
      lte: endDate ? new Date(endDate) : undefined,
    };
  }
  if (search) {
    where.OR = [
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { agent: { name: { contains: search, mode: "insensitive" } } },
      { agent: { code: { contains: search, mode: "insensitive" } } },
      { model: { displayName: { contains: search, mode: "insensitive" } } },
      { account: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [events, total] = await Promise.all([
    prisma.aiUsageEvent.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, name: true, code: true } },
        model: { select: { id: true, displayName: true, modelId: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiUsageEvent.count({ where }),
  ]);

  return { events: events.map(serialize), total };
}

export async function getAiUsageEvent(id: string) {
  const event = await prisma.aiUsageEvent.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      agent: { select: { id: true, name: true, code: true } },
      model: { select: { id: true, displayName: true, modelId: true } },
      account: { select: { id: true, name: true } },
    },
  });
  if (!event) {
    throw new HTTPException(404, { message: "AI usage event not found" });
  }
  return serialize(event);
}

export async function deleteAiUsageEvents(ids: string[]) {
  if (ids.length === 0) return { success: true as const, count: 0 };
  const result = await prisma.aiUsageEvent.deleteMany({
    where: { id: { in: ids } },
  });
  return { success: true as const, count: result.count };
}
