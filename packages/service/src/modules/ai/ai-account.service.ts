import { HTTPException } from "hono/http-exception";
import type { AiAccount, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

type AccountRow = AiAccount & { providers: { providerId: string }[] };

function serialize(account: AccountRow) {
  const { providers, ...rest } = account;
  return {
    ...rest,
    balance: Number(account.balance),
    providerIds: providers.map((p) => p.providerId),
  };
}

export async function listAiAccounts(params: {
  search?: string;
  providerId?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, providerId, limit = 10, offset = 0 } = params;
  const where: Prisma.AiAccountWhereInput = {};
  if (providerId) where.providers = { some: { providerId } };
  if (search) where.name = { contains: search, mode: "insensitive" };
  const [accounts, total] = await Promise.all([
    prisma.aiAccount.findMany({
      where,
      include: { providers: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiAccount.count({ where }),
  ]);
  return { accounts: accounts.map(serialize), total };
}

export async function getAiAccount(id: string) {
  const account = await prisma.aiAccount.findUnique({
    where: { id },
    include: { providers: true },
  });
  if (!account) {
    throw new HTTPException(404, { message: "AI account not found" });
  }
  return serialize(account);
}

export async function createAiAccount(data: {
  providerIds: string[];
  name: string;
  balance?: number;
  currency?: string;
  concurrencyLimit?: number;
  status?: string;
}) {
  const { providerIds, ...rest } = data;
  const account = await prisma.aiAccount.create({
    data: {
      ...rest,
      providers: {
        create: providerIds.map((providerId) => ({ providerId })),
      },
    },
    include: { providers: true },
  });
  return serialize(account);
}

export async function updateAiAccount(
  id: string,
  data: {
    name?: string;
    balance?: number;
    currency?: string;
    concurrencyLimit?: number;
    status?: string;
    providerIds?: string[];
  },
) {
  await getAiAccount(id);
  const { providerIds, ...rest } = data;
  const account = await prisma.$transaction(async (tx) => {
    if (providerIds) {
      await tx.aiAccountProvider.deleteMany({ where: { accountId: id } });
      await tx.aiAccountProvider.createMany({
        data: providerIds.map((providerId) => ({ accountId: id, providerId })),
      });
    }
    return tx.aiAccount.update({
      where: { id },
      data: rest,
      include: { providers: true },
    });
  });
  return serialize(account);
}

export async function deleteAiAccount(id: string) {
  await getAiAccount(id);
  const keys = await prisma.aiKey.count({ where: { accountId: id } });
  if (keys > 0) {
    throw new HTTPException(409, {
      message: "Cannot delete an account that still has keys.",
    });
  }
  await prisma.aiAccount.delete({ where: { id } });
  return { success: true as const };
}
