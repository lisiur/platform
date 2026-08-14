import { HTTPException } from "hono/http-exception";
import type { PricingPlan, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

type PlanRow = PricingPlan & {
  features: {
    featureId: string;
    feature: { code: string; name: string };
  }[];
};

function serialize(plan: PlanRow) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    price: Number(plan.price),
    currency: plan.currency,
    status: plan.status,
    features: plan.features.map((f) => ({
      featureId: f.featureId,
      code: f.feature.code,
      name: f.feature.name,
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function listPricingPlans(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, limit = 10, offset = 0 } = params;
  const where: Prisma.PricingPlanWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  const [plans, total] = await Promise.all([
    prisma.pricingPlan.findMany({
      where,
      include: { features: { include: { feature: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.pricingPlan.count({ where }),
  ]);
  return { plans: plans.map(serialize), total };
}

export async function getPricingPlan(id: string) {
  const plan = await prisma.pricingPlan.findUnique({
    where: { id },
    include: { features: { include: { feature: true } } },
  });
  if (!plan) {
    throw new HTTPException(404, { message: "Pricing plan not found" });
  }
  return serialize(plan);
}

export async function createPricingPlan(data: {
  code: string;
  name: string;
  price?: number;
  currency?: string;
  status?: string;
  features?: Array<{ featureId: string }>;
}) {
  const existing = await prisma.pricingPlan.findUnique({
    where: { code: data.code },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Plan code already exists." });
  }
  const { features = [], ...rest } = data;
  const plan = await prisma.pricingPlan.create({
    data: {
      ...rest,
      features: {
        create: features.map((f) => ({
          featureId: f.featureId,
        })),
      },
    },
    include: { features: { include: { feature: true } } },
  });
  return serialize(plan);
}

export async function updatePricingPlan(
  id: string,
  data: {
    name?: string;
    price?: number;
    currency?: string;
    status?: string;
    features?: Array<{ featureId: string }>;
  },
) {
  await getPricingPlan(id);
  const { features, ...rest } = data;
  if (features) {
    await prisma.planFeature.deleteMany({ where: { planId: id } });
    await prisma.planFeature.createMany({
      data: features.map((f) => ({
        planId: id,
        featureId: f.featureId,
      })),
    });
  }
  const plan = await prisma.pricingPlan.update({
    where: { id },
    data: rest,
    include: { features: { include: { feature: true } } },
  });
  return serialize(plan);
}

export async function deletePricingPlan(id: string) {
  await getPricingPlan(id);
  const subs = await prisma.pricingSubscription.count({
    where: { planId: id },
  });
  if (subs > 0) {
    throw new HTTPException(409, {
      message: "Cannot delete a plan that has subscriptions.",
    });
  }
  await prisma.pricingPlan.delete({ where: { id } });
  return { success: true as const };
}
