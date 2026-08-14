import { HTTPException } from "hono/http-exception";
import type { AiKey, Prisma } from "#generated/prisma/client";
import { encryptSecret } from "#lib/crypto";
import { prisma } from "#lib/db";

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function serialize(key: AiKey) {
  return {
    id: key.id,
    accountId: key.accountId,
    name: key.name,
    mask: key.mask,
    status: key.status,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

export async function listAiKeys(params: {
  search?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, accountId, limit = 10, offset = 0 } = params;
  const where: Prisma.AiKeyWhereInput = {};
  if (accountId) where.accountId = accountId;
  if (search) where.name = { contains: search, mode: "insensitive" };
  const [keys, total] = await Promise.all([
    prisma.aiKey.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiKey.count({ where }),
  ]);
  return { keys: keys.map(serialize), total };
}

export async function getAiKey(id: string) {
  const key = await prisma.aiKey.findUnique({ where: { id } });
  if (!key) {
    throw new HTTPException(404, { message: "AI key not found" });
  }
  return serialize(key);
}

export async function createAiKey(data: {
  accountId: string;
  name: string;
  secret: string;
  status?: string;
  expiresAt?: Date | null;
}) {
  const key = await prisma.aiKey.create({
    data: {
      accountId: data.accountId,
      name: data.name,
      encryptedSecret: encryptSecret(data.secret),
      mask: maskSecret(data.secret),
      status: data.status,
      expiresAt: data.expiresAt,
    },
  });
  return serialize(key);
}

export async function updateAiKey(
  id: string,
  data: {
    name?: string;
    secret?: string;
    status?: string;
    expiresAt?: Date | null;
  },
) {
  await getAiKey(id);
  const update: Prisma.AiKeyUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.status !== undefined) update.status = data.status;
  if (data.expiresAt !== undefined) update.expiresAt = data.expiresAt;
  if (data.secret !== undefined) {
    update.encryptedSecret = encryptSecret(data.secret);
    update.mask = maskSecret(data.secret);
  }
  const key = await prisma.aiKey.update({ where: { id }, data: update });
  return serialize(key);
}

export async function deleteAiKey(id: string) {
  await getAiKey(id);
  await prisma.aiKey.delete({ where: { id } });
  return { success: true as const };
}
