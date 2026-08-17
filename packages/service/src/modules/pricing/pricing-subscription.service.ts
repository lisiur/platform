import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

async function allocateQuotas(principalId: string) {
  await prisma.userQuota.upsert({
    where: { userId: principalId },
    update: {},
    create: { userId: principalId, allocated: 0, used: 0 },
  });
}

export async function listPricingSubscriptions(params: {
  principalType?: string;
  principalId?: string;
  planId?: string;
  limit?: number;
  offset?: number;
}) {
  const { principalType, principalId, planId, limit = 10, offset = 0 } = params;
  const where: Prisma.PricingSubscriptionWhereInput = {};
  if (principalType) where.principalType = principalType;
  if (principalId) where.principalId = principalId;
  if (planId) where.planId = planId;
  const [subscriptions, total] = await Promise.all([
    prisma.pricingSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.pricingSubscription.count({ where }),
  ]);
  return { subscriptions, total };
}

export async function getPricingSubscription(id: string) {
  const subscription = await prisma.pricingSubscription.findUnique({
    where: { id },
  });
  if (!subscription) {
    throw new HTTPException(404, { message: "Subscription not found" });
  }
  return subscription;
}

export async function createPricingSubscription(data: {
  principalType: string;
  principalId: string;
  planId: string;
  status?: string;
  startsAt?: Date;
  endsAt?: Date | null;
}) {
  const subscription = await prisma.pricingSubscription.create({ data });
  if (subscription.status === "active") {
    await allocateQuotas(subscription.principalId);
  }
  return subscription;
}

export async function subscribeUserToBasicPlan(userId: string) {
  const plan = await prisma.pricingPlan.findUnique({
    where: { code: "basic" },
  });
  if (plan?.status !== "active") {
    return null;
  }
  return createPricingSubscription({
    principalType: "user",
    principalId: userId,
    planId: plan.id,
    status: "active",
    endsAt: null,
  });
}

export async function updatePricingSubscription(
  id: string,
  data: {
    status?: string;
    endsAt?: Date | null;
  },
) {
  const current = await getPricingSubscription(id);
  const subscription = await prisma.pricingSubscription.update({
    where: { id },
    data,
  });
  if (data.status === "active" && current.status !== "active") {
    await allocateQuotas(subscription.principalId);
  }
  return subscription;
}

export async function deletePricingSubscription(id: string) {
  await getPricingSubscription(id);
  await prisma.pricingSubscription.delete({ where: { id } });
  return { success: true as const };
}
