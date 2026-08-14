import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

function activeSubscriptionWhere(
  userId: string,
  now: Date,
): Prisma.PricingSubscriptionWhereInput {
  return {
    principalType: "user",
    principalId: userId,
    status: "active",
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export async function listActiveFeaturesForUser(userId: string) {
  const now = new Date();
  const subscriptions = await prisma.pricingSubscription.findMany({
    where: activeSubscriptionWhere(userId, now),
    include: {
      plan: {
        include: {
          features: {
            include: {
              feature: { select: { code: true, name: true, status: true } },
            },
          },
        },
      },
    },
  });

  const features = new Map<string, { code: string; name: string }>();
  for (const subscription of subscriptions) {
    for (const planFeature of subscription.plan.features) {
      if (planFeature.feature.status !== "active") continue;
      features.set(planFeature.feature.code, {
        code: planFeature.feature.code,
        name: planFeature.feature.name,
      });
    }
  }
  return Array.from(features.values());
}

export async function hasActiveFeatureForUser(
  userId: string,
  featureCode: string,
) {
  const now = new Date();
  const subscription = await prisma.pricingSubscription.findFirst({
    where: {
      ...activeSubscriptionWhere(userId, now),
      plan: {
        features: {
          some: {
            feature: {
              code: featureCode,
              status: "active",
            },
          },
        },
      },
    },
    select: { id: true },
  });
  return !!subscription;
}

export async function listFeatures(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, limit = 10, offset = 0 } = params;
  const where: Prisma.FeatureWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  const [features, total] = await Promise.all([
    prisma.feature.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.feature.count({ where }),
  ]);
  return { features, total };
}

export async function getFeature(id: string) {
  const feature = await prisma.feature.findUnique({ where: { id } });
  if (!feature) {
    throw new HTTPException(404, { message: "Feature not found" });
  }
  return feature;
}

export async function createFeature(data: {
  code: string;
  name: string;
  description?: string | null;
  status?: string;
}) {
  const existing = await prisma.feature.findUnique({
    where: { code: data.code },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Feature code already exists." });
  }
  return prisma.feature.create({ data });
}

export async function updateFeature(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    status?: string;
  },
) {
  await getFeature(id);
  return prisma.feature.update({ where: { id }, data });
}

export async function deleteFeature(id: string) {
  await getFeature(id);
  await prisma.feature.delete({ where: { id } });
  return { success: true as const };
}
