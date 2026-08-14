import { AI_ADAPTERS } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

const aiAdapterSchema = z.enum(AI_ADAPTERS);

function serialize<T extends { aiAdapter: string }>(p: T) {
  return { ...p, aiAdapter: aiAdapterSchema.parse(p.aiAdapter) };
}

export async function listAiProviders(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, limit = 10, offset = 0 } = params;
  const where: Prisma.AiProviderWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { baseUrl: { contains: search, mode: "insensitive" } },
    ];
  }
  const [providers, total] = await Promise.all([
    prisma.aiProvider.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiProvider.count({ where }),
  ]);
  return { providers: providers.map(serialize), total };
}

export async function getAiProvider(id: string) {
  const provider = await prisma.aiProvider.findUnique({ where: { id } });
  if (!provider) {
    throw new HTTPException(404, { message: "AI provider not found" });
  }
  return serialize(provider);
}

export async function createAiProvider(data: {
  name: string;
  baseUrl: string;
  aiAdapter: string;
  enabled?: boolean;
  description?: string | null;
}) {
  const provider = await prisma.aiProvider.create({ data });
  return serialize(provider);
}

export async function updateAiProvider(
  id: string,
  data: {
    name?: string;
    baseUrl?: string;
    aiAdapter?: string;
    enabled?: boolean;
    description?: string | null;
  },
) {
  await getAiProvider(id);
  const provider = await prisma.aiProvider.update({ where: { id }, data });
  return serialize(provider);
}

export async function deleteAiProvider(id: string) {
  await getAiProvider(id);
  const accounts = await prisma.aiAccountProvider.count({
    where: { providerId: id },
  });
  if (accounts > 0) {
    throw new HTTPException(409, {
      message: "Cannot delete a provider that still has accounts.",
    });
  }
  await prisma.aiProvider.delete({ where: { id } });
  return { success: true as const };
}
