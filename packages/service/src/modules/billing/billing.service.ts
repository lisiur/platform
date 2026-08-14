import { HTTPException } from "hono/http-exception";
import type { BillingConfig, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { userCreditRepository } from "#modules/redeem-code/user-credit.repository";
import {
  getConfigRow,
  upsertConfig,
} from "#modules/system/system-config.service";

export const BILLING_RESOURCE_AI_AGENT = "ai_agent";
const MISSING_ACTIVE_CURRENCY_RATE_PREFIX = "Missing active currency rate for ";

export type BillingType = "cost_based" | "per_call" | "none";
type BillingStatus = "active" | "disabled";

export interface ResolvedBillingConfig {
  resourceType: string;
  resourceId: string;
  billingType: BillingType;
  priceUnit: string;
  priceAmount: number;
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function parseBillingType(value: string): BillingType {
  if (value === "cost_based" || value === "per_call" || value === "none") {
    return value;
  }
  throw new HTTPException(400, { message: `Invalid billing type: ${value}` });
}

function parseStatus(value: string): BillingStatus {
  if (value === "active" || value === "disabled") return value;
  throw new HTTPException(400, { message: `Invalid billing status: ${value}` });
}

function serializeBillingConfig(row: BillingConfig) {
  return {
    ...row,
    billingType: parseBillingType(row.billingType),
    status: parseStatus(row.status),
    priceAmount: Number(row.priceAmount),
  };
}

async function getCurrencyConfig() {
  const [creditsCurrencyRow, creditsRow] = await Promise.all([
    getConfigRow("currency", "creditsCurrency"),
    getConfigRow("currency", "creditsPerUnit"),
  ]);
  return {
    creditsCurrency: normalizeCurrency(creditsCurrencyRow?.value || "CNY"),
    creditsPerUnit: Number(creditsRow?.value || "100"),
  };
}

async function getCurrencyRate(currency: string) {
  const normalized = normalizeCurrency(currency);
  if (normalized === "USD") return 1;
  const rateRow = await prisma.currencyRate.findUnique({
    where: { currency: normalized },
  });
  const rate = Number(rateRow?.rate);
  if (!rate || rate <= 0 || rateRow?.status === "disabled") {
    throw new HTTPException(500, {
      message: `${MISSING_ACTIVE_CURRENCY_RATE_PREFIX}${normalized}.`,
    });
  }
  return rate;
}

export function isMissingActiveCurrencyRateError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith(MISSING_ACTIVE_CURRENCY_RATE_PREFIX)
  );
}

export async function listBillingConfigs(params: {
  resourceType?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Prisma.BillingConfigWhereInput = {};
  if (params.resourceType) where.resourceType = params.resourceType;
  const [configs, total] = await Promise.all([
    prisma.billingConfig.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: params.limit ?? 20,
      skip: params.offset ?? 0,
    }),
    prisma.billingConfig.count({ where }),
  ]);
  return { configs: configs.map(serializeBillingConfig), total };
}

export async function createBillingConfig(data: {
  resourceType: string;
  resourceId: string;
  billingType: string;
  priceUnit?: string;
  priceAmount?: number;
  status?: string;
  description?: string | null;
}) {
  const config = await prisma.billingConfig.create({
    data: {
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      billingType: parseBillingType(data.billingType),
      priceUnit: data.priceUnit ?? "credit",
      priceAmount: data.priceAmount ?? 0,
      status: data.status ?? "active",
      description: data.description,
    },
  });
  return serializeBillingConfig(config);
}

export async function updateBillingConfig(
  id: string,
  data: {
    resourceType?: string;
    resourceId?: string;
    billingType?: string;
    priceUnit?: string;
    priceAmount?: number;
    status?: string;
    description?: string | null;
  },
) {
  const config = await prisma.billingConfig.update({
    where: { id },
    data: {
      ...data,
      billingType: data.billingType
        ? parseBillingType(data.billingType)
        : undefined,
    },
  });
  return serializeBillingConfig(config);
}

export async function deleteBillingConfig(id: string) {
  await prisma.billingConfig.delete({ where: { id } });
  return { success: true as const };
}

export async function resolveBilling(
  resourceType: string,
  resourceId: string,
): Promise<ResolvedBillingConfig> {
  const config = await prisma.billingConfig.findUnique({
    where: { resourceType_resourceId: { resourceType, resourceId } },
  });
  if (config?.status !== "active") {
    return {
      resourceType,
      resourceId,
      billingType: "none",
      priceUnit: "credit",
      priceAmount: 0,
    };
  }
  return {
    resourceType,
    resourceId,
    billingType: parseBillingType(config.billingType),
    priceUnit: config.priceUnit,
    priceAmount: Number(config.priceAmount),
  };
}

export const COST_BASED_RESERVE_CREDITS = 100;

function assertCreditPriceUnit(billing: ResolvedBillingConfig) {
  if (billing.priceUnit !== "credit") {
    throw new HTTPException(400, {
      message: `Unsupported billing price unit: ${billing.priceUnit}`,
    });
  }
}

/** Positive number of credits to reserve up front for the given billing type. */
export async function computeReserveAmount(
  billing: ResolvedBillingConfig,
): Promise<number> {
  if (billing.billingType === "none") return 0;
  assertCreditPriceUnit(billing);
  if (billing.billingType === "per_call") {
    return Math.ceil(billing.priceAmount);
  }
  return COST_BASED_RESERVE_CREDITS;
}

/** Positive number of credits to charge for the given billing type and usage. */
export async function computeChargeAmount(
  billing: ResolvedBillingConfig,
  usage?: { cost: number; currency: string },
): Promise<number> {
  if (billing.billingType === "none") return 0;
  assertCreditPriceUnit(billing);
  if (billing.billingType === "per_call") {
    return Math.ceil(billing.priceAmount);
  }
  if (!usage) {
    throw new HTTPException(500, {
      message: "Cost-based billing requires usage cost and currency.",
    });
  }
  const currency = normalizeCurrency(usage.currency);
  const { creditsCurrency, creditsPerUnit } = await getCurrencyConfig();
  const [usageRate, creditsRate] = await Promise.all([
    getCurrencyRate(currency),
    getCurrencyRate(creditsCurrency),
  ]);
  const costInCreditsCurrency = (usage.cost / usageRate) * creditsRate;
  return Math.ceil(costInCreditsCurrency * creditsPerUnit);
}

const INSUFFICIENT_BALANCE_MESSAGE = "Credit balance cannot be negative";

function toInsufficientCredit(error: unknown): HTTPException {
  if (
    error instanceof Error &&
    error.message === INSUFFICIENT_BALANCE_MESSAGE
  ) {
    return new HTTPException(402, {
      message:
        "Insufficient credit balance. Redeem a code before using AI Agent.",
    });
  }
  throw error;
}

/**
 * Reserves credits for an in-flight AI request before it runs. Per-call
 * billing reserves the full price (fails with 402 if balance is insufficient);
 * cost-based billing reserves a fixed amount and allows the balance to go
 * negative. Returns the reserved amount (0 when billing is `none`).
 */
export async function reserveForAiUsage(params: {
  userId: string;
  billing: ResolvedBillingConfig;
  usageEventId: string;
}): Promise<{ reservedAmount: number }> {
  const reservedAmount = await computeReserveAmount(params.billing);
  if (reservedAmount <= 0) return { reservedAmount: 0 };
  try {
    await userCreditRepository.reserveCredits(params.userId, {
      amount: reservedAmount,
      type: "ai_usage_reserve",
      referenceType: "ai_usage_event",
      referenceId: params.usageEventId,
      description: `AI usage reserve: ${params.billing.resourceType}/${params.billing.resourceId}`,
      metadata: {
        billingType: params.billing.billingType,
        priceUnit: params.billing.priceUnit,
      },
      allowNegative: params.billing.billingType !== "per_call",
    });
  } catch (err) {
    throw toInsufficientCredit(err);
  }
  return { reservedAmount };
}

/**
 * Settles a reservation after the request completes: charges the final amount,
 * refunding any excess back to balance or debiting any shortage (balance may go
 * negative). A missing currency rate releases the reservation and marks the
 * usage event `billing-failed` instead of throwing.
 */
export async function settleForAiUsage(params: {
  userId: string;
  billing: ResolvedBillingConfig;
  usageEventId: string;
  reservedAmount: number;
  cost: number;
  currency: string;
}): Promise<void> {
  if (params.reservedAmount <= 0) return;
  let chargeAmount: number;
  try {
    chargeAmount = await computeChargeAmount(params.billing, {
      cost: params.cost,
      currency: params.currency,
    });
  } catch (err) {
    const marked = await markUsageEventBillingFailedForMissingCurrencyRate(
      params.usageEventId,
      err,
    );
    if (!marked) throw err;
    await releaseForAiUsage({
      userId: params.userId,
      billing: params.billing,
      usageEventId: params.usageEventId,
      reservedAmount: params.reservedAmount,
    });
    return;
  }
  await userCreditRepository.settleCredits(params.userId, {
    reservedAmount: params.reservedAmount,
    chargeAmount,
    type: "ai_usage",
    referenceType: "ai_usage_event",
    referenceId: params.usageEventId,
    description: `AI usage: ${params.billing.resourceType}/${params.billing.resourceId}`,
    metadata: {
      billingType: params.billing.billingType,
      priceUnit: params.billing.priceUnit,
      cost: params.cost,
      currency: normalizeCurrency(params.currency),
    },
  });
}

/**
 * Releases a reservation in full (e.g. when the request fails), returning the
 * reserved credits from `frozen` back to `balance`.
 */
export async function releaseForAiUsage(
  params: {
    userId: string;
    billing: ResolvedBillingConfig;
    usageEventId: string;
    reservedAmount: number;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (params.reservedAmount <= 0) return;
  await userCreditRepository.settleCredits(
    params.userId,
    {
      reservedAmount: params.reservedAmount,
      chargeAmount: 0,
      type: "ai_usage_refund",
      referenceType: "ai_usage_event",
      referenceId: params.usageEventId,
      description: `AI usage refund: ${params.billing.resourceType}/${params.billing.resourceId}`,
      metadata: {
        billingType: params.billing.billingType,
        priceUnit: params.billing.priceUnit,
      },
    },
    tx,
  );
}

export async function markUsageEventBillingFailedForMissingCurrencyRate(
  usageEventId: string,
  error: unknown,
) {
  if (!isMissingActiveCurrencyRateError(error)) return false;
  await prisma.aiUsageEvent.update({
    where: { id: usageEventId },
    data: { status: "billing-failed" },
  });
  return true;
}

const AI_USAGE_STALE_BATCH_SIZE = 500;

/**
 * Releases credit reservations left in `frozen` by AI usage events that never
 * reached a terminal status — e.g. the service crashed mid-stream so the
 * `onFinish`/`onError` release callbacks never ran. Events still `pending` and
 * older than `staleBefore` are inspected: the reserved amount recorded on the
 * ledger (`ai_usage_reserve` entry keyed by the usage event id) is looked up
 * first, and only when a positive reservation exists is the event atomically
 * claimed (flipped to `expired`) and its reservation refunded in full. Events
 * without a recorded reservation are left `pending` so they remain reclaimable.
 * The claim and refund run in one transaction, so a concurrent settle path (or
 * a second sweep run) can never double-release a reservation. Callers should
 * pass a generous `staleBefore` so legitimate long-running streams are not
 * released mid-flight.
 */
export async function sweepStaleAiUsageReservations(
  staleBefore: Date,
): Promise<{
  stale: number;
  released: number;
}> {
  let stale = 0;
  let released = 0;

  while (true) {
    const events = await prisma.aiUsageEvent.findMany({
      where: { status: "pending", createdAt: { lt: staleBefore } },
      select: { id: true, userId: true, agentId: true },
      orderBy: { createdAt: "asc" },
      take: AI_USAGE_STALE_BATCH_SIZE,
    });
    if (events.length === 0) break;

    const agentRows = await prisma.aiAgent.findMany({
      where: {
        id: {
          in: events.map((e) => e.agentId).filter((id): id is string => !!id),
        },
      },
      select: { id: true, code: true },
    });
    const agentCodeById = new Map(agentRows.map((a) => [a.id, a.code]));

    for (const event of events) {
      const userId = event.userId;
      if (!userId) continue;
      stale++;
      const resourceId = event.agentId
        ? (agentCodeById.get(event.agentId) ?? "")
        : "";
      const billing = await resolveBilling(
        BILLING_RESOURCE_AI_AGENT,
        resourceId,
      );

      await prisma.$transaction(async (tx) => {
        const reserve = await tx.userCreditLedger.findFirst({
          where: {
            userId,
            type: "ai_usage_reserve",
            referenceType: "ai_usage_event",
            referenceId: event.id,
          },
          orderBy: { createdAt: "desc" },
        });
        const reservedAmount = reserve ? -Number(reserve.amount) : 0;
        if (reservedAmount <= 0) return;

        const claimed = await tx.aiUsageEvent.updateMany({
          where: { id: event.id, status: "pending" },
          data: { status: "expired" },
        });
        if (claimed.count !== 1) return;

        await releaseForAiUsage(
          { userId, billing, usageEventId: event.id, reservedAmount },
          tx,
        );
        released++;
      });
    }
  }

  return { stale, released };
}

export async function setLastCurrencySync(value: string) {
  await upsertConfig("currency", "lastSync", { value });
}
