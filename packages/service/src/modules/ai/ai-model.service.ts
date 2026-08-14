import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export async function listAiModels(params: {
  search?: string;
  providerId?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, providerId, limit = 10, offset = 0 } = params;
  const where: Prisma.AiModelWhereInput = {};
  if (providerId) where.providerId = providerId;
  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { modelId: { contains: search, mode: "insensitive" } },
    ];
  }
  const [models, total] = await Promise.all([
    prisma.aiModel.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiModel.count({ where }),
  ]);
  return { models, total };
}

export async function getAiModel(id: string) {
  const model = await prisma.aiModel.findUnique({ where: { id } });
  if (!model) {
    throw new HTTPException(404, { message: "AI model not found" });
  }
  return model;
}

export async function createAiModel(data: {
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities?: string[];
  contextWindow?: number | null;
  supportsReasoning?: boolean;
  supportsCaching?: boolean;
  enabled?: boolean;
}) {
  const existing = await prisma.aiModel.findUnique({
    where: {
      providerId_modelId: {
        providerId: data.providerId,
        modelId: data.modelId,
      },
    },
  });
  if (existing) {
    throw new HTTPException(409, {
      message: "A model with this provider and modelId already exists.",
    });
  }
  return prisma.aiModel.create({ data });
}

export async function updateAiModel(
  id: string,
  data: {
    providerId?: string;
    modelId?: string;
    displayName?: string;
    capabilities?: string[];
    contextWindow?: number | null;
    supportsReasoning?: boolean;
    supportsCaching?: boolean;
    enabled?: boolean;
  },
) {
  await getAiModel(id);
  return prisma.aiModel.update({ where: { id }, data });
}

export async function deleteAiModel(id: string) {
  await getAiModel(id);
  const usage = await prisma.aiUsageEvent.count({ where: { modelId: id } });
  if (usage > 0) {
    throw new HTTPException(409, {
      message: "Cannot delete a model that has usage history.",
    });
  }
  await prisma.aiModel.delete({ where: { id } });
  return { success: true as const };
}
