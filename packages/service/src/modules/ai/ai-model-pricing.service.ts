import { HTTPException } from "hono/http-exception";
import type { AiModelPricing, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

const MINUTES_PER_DAY = 1440;

type TimeInterval = [number, number];

export interface PricingPolicyItem {
  input: number;
  cachedInput: number;
  output: number;
  startMinutes: number;
  endMinutes: number;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeRange(start: number, end: number): TimeInterval[] {
  if (start === 0 && end === MINUTES_PER_DAY) return [[0, MINUTES_PER_DAY]];
  if (start < end) return [[start, end]];

  const intervals: TimeInterval[] = [[start, MINUTES_PER_DAY]];
  if (end > 0) intervals.push([0, end]);
  return intervals;
}

function parsePolicy(value: unknown): PricingPolicyItem[] {
  if (!Array.isArray(value)) {
    throw new HTTPException(400, {
      message: "Pricing policy must be an array",
    });
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HTTPException(400, {
        message: `Pricing policy item ${index + 1} is invalid`,
      });
    }
    const record = item as Record<string, unknown>;
    const policyItem = {
      input: Number(record.input),
      cachedInput: Number(record.cachedInput),
      output: Number(record.output),
      startMinutes: Number(record.startMinutes),
      endMinutes: Number(record.endMinutes),
    };
    if (
      !Number.isFinite(policyItem.input) ||
      !Number.isFinite(policyItem.cachedInput) ||
      !Number.isFinite(policyItem.output) ||
      !Number.isInteger(policyItem.startMinutes) ||
      !Number.isInteger(policyItem.endMinutes)
    ) {
      throw new HTTPException(400, {
        message: `Pricing policy item ${index + 1} is invalid`,
      });
    }
    return policyItem;
  });
}

function validatePolicy(policy: PricingPolicyItem[]) {
  if (policy.length === 0) {
    throw new HTTPException(400, { message: "Pricing policy is required" });
  }

  const intervals: TimeInterval[] = [];
  for (const item of policy) {
    if (
      item.input < 0 ||
      item.cachedInput < 0 ||
      item.output < 0 ||
      item.startMinutes < 0 ||
      item.startMinutes > MINUTES_PER_DAY - 1 ||
      item.endMinutes < 0 ||
      item.endMinutes > MINUTES_PER_DAY
    ) {
      throw new HTTPException(400, { message: "Invalid pricing policy" });
    }
    if (item.startMinutes === item.endMinutes) {
      throw new HTTPException(400, { message: "Time range must not be empty" });
    }
    intervals.push(...normalizeTimeRange(item.startMinutes, item.endMinutes));
  }

  intervals.sort((a, b) => a[0] - b[0]);
  let coveredUntil = 0;
  for (const [start, end] of intervals) {
    if (start < coveredUntil) {
      throw new HTTPException(400, {
        message: "Pricing policy time ranges must not overlap",
      });
    }
    if (start > coveredUntil) {
      throw new HTTPException(400, {
        message: "Pricing policy time ranges must cover all day",
      });
    }
    coveredUntil = end;
  }
  if (coveredUntil !== MINUTES_PER_DAY) {
    throw new HTTPException(400, {
      message: "Pricing policy time ranges must cover all day",
    });
  }
}

function validatePricingPolicy(data: {
  timeZone: string;
  policy: unknown;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}): PricingPolicyItem[] {
  if (!isValidTimeZone(data.timeZone)) {
    throw new HTTPException(400, { message: "Invalid time zone" });
  }
  if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) {
    throw new HTTPException(400, {
      message: "Effective end must be after effective start",
    });
  }
  const policy = parsePolicy(data.policy);
  validatePolicy(policy);
  return policy;
}

async function assertNoEffectiveDateOverlap(data: {
  id?: string;
  modelId: string;
  accountId: string;
  timeZone: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}) {
  const where: Prisma.AiModelPricingWhereInput = {
    modelId: data.modelId,
    accountId: data.accountId,
    timeZone: data.timeZone,
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: data.effectiveFrom } }],
  };
  if (data.id) where.id = { not: data.id };
  if (data.effectiveTo) where.effectiveFrom = { lt: data.effectiveTo };

  const conflict = await prisma.aiModelPricing.findFirst({ where });
  if (conflict) {
    throw new HTTPException(409, {
      message: "Pricing effective date range overlaps an existing row",
    });
  }
}

function serialize(p: AiModelPricing) {
  return {
    id: p.id,
    modelId: p.modelId,
    accountId: p.accountId,
    timeZone: p.timeZone,
    policy: parsePolicy(p.policy),
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    createdAt: p.createdAt,
  };
}

export async function listAiModelPricing(params: {
  modelId?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
}) {
  const { modelId, accountId, limit = 10, offset = 0 } = params;
  const where: Prisma.AiModelPricingWhereInput = {};
  if (modelId) where.modelId = modelId;
  if (accountId) where.accountId = accountId;
  const [pricing, total] = await Promise.all([
    prisma.aiModelPricing.findMany({
      where,
      orderBy: { effectiveFrom: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiModelPricing.count({ where }),
  ]);
  return { pricing: pricing.map(serialize), total };
}

export async function getAiModelPricing(id: string) {
  const pricing = await prisma.aiModelPricing.findUnique({ where: { id } });
  if (!pricing) {
    throw new HTTPException(404, { message: "Model pricing not found" });
  }
  return serialize(pricing);
}

export async function createAiModelPricing(data: {
  modelId: string;
  accountId: string;
  timeZone: string;
  policy: PricingPolicyItem[];
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}) {
  validatePricingPolicy(data);
  await assertNoEffectiveDateOverlap(data);
  const pricing = await prisma.aiModelPricing.create({
    data: {
      ...data,
      policy: data.policy as unknown as Prisma.InputJsonValue,
    },
  });
  return serialize(pricing);
}

export async function updateAiModelPricing(
  id: string,
  data: {
    timeZone?: string;
    policy?: PricingPolicyItem[];
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
  },
) {
  const current = await prisma.aiModelPricing.findUnique({ where: { id } });
  if (!current) {
    throw new HTTPException(404, { message: "Model pricing not found" });
  }
  const next = {
    modelId: current.modelId,
    accountId: current.accountId,
    timeZone: data.timeZone ?? current.timeZone,
    policy: data.policy ?? parsePolicy(current.policy),
    effectiveFrom: data.effectiveFrom ?? current.effectiveFrom,
    effectiveTo:
      data.effectiveTo === undefined ? current.effectiveTo : data.effectiveTo,
  };
  validatePricingPolicy(next);
  await assertNoEffectiveDateOverlap({ id, ...next });
  const updateData = {
    ...data,
    policy: data.policy as unknown as Prisma.InputJsonValue | undefined,
  };
  const pricing = await prisma.aiModelPricing.update({
    where: { id },
    data: updateData,
  });
  return serialize(pricing);
}

export async function deleteAiModelPricing(id: string) {
  await getAiModelPricing(id);
  await prisma.aiModelPricing.delete({ where: { id } });
  return { success: true as const };
}
