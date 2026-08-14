import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function listQuotas(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, limit = 10, offset = 0 } = params;
  const where: Record<string, unknown> = {};
  if (search) {
    where.user = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    };
  }
  const [quotas, total] = await Promise.all([
    prisma.userQuota.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userQuota.count({ where }),
  ]);
  return { quotas, total };
}

export async function getQuota(id: string) {
  const quota = await prisma.userQuota.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!quota) {
    throw new HTTPException(404, { message: "Quota not found" });
  }
  return quota;
}

export async function updateQuota(
  id: string,
  data: {
    allocated?: number;
    used?: number;
  },
) {
  await getQuota(id);
  return prisma.userQuota.update({
    where: { id },
    data,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}
