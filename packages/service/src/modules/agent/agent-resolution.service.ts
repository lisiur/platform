import { AI_REASONING_LEVELS, type AiReasoningLevel } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { ProviderEndpoint } from "#lib/ai-agent/provider-adapter";
import { decryptSecret } from "#lib/crypto";
import { prisma } from "#lib/db";
import { hasActiveFeatureForUser } from "#modules/pricing/public";
import { accountConcurrencyTracker } from "./account-concurrency";

const reasoningSchema = z.enum(AI_REASONING_LEVELS);
const MINUTES_PER_DAY = 1440;

type TimeInterval = [number, number];

const pricingPolicySchema = z.array(
  z.object({
    input: z.number(),
    cachedInput: z.number(),
    output: z.number(),
    startMinutes: z.number().int(),
    endMinutes: z.number().int(),
  }),
);

const subAgentSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  modelId: z.string().trim().min(1),
  systemPrompt: z.string().nullable().optional(),
  reasoning: reasoningSchema.nullable().optional(),
  temperature: z.number().nullable().optional(),
  maxSteps: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});

const subAgentsSchema = z.record(z.string(), subAgentSchema);

export type AgentSubAgentConfig = z.infer<typeof subAgentSchema>;

export interface Principal {
  type: "user";
  id: string;
}

export interface ResolvedAgentMeta {
  id: string;
  systemPrompt: string | null;
  reasoning: AiReasoningLevel | null;
  maxSteps: number;
  temperature: number | null;
}

export interface PricingRates {
  input: number;
  cachedInput: number;
  output: number;
}

export interface ResolvedAgentRuntime {
  agent: ResolvedAgentMeta;
  subAgent: AgentSubAgentConfig;
  allowedApis: string[];
  endpoint: ProviderEndpoint;
  aiModelId: string;
  accountId: string;
  accountConcurrencyLimit: number;
  pricing: PricingRates | null;
  currency: string;
}

export class AgentNotEntitledError extends HTTPException {
  constructor(agentCode: string) {
    super(403, {
      message: `AI Agent "${agentCode}" is not enabled for this user.`,
    });
  }
}

export class AgentModelUnavailableError extends HTTPException {
  constructor(agentCode: string, subAgent?: string) {
    super(503, {
      message: `AI Agent "${agentCode}"${subAgent ? ` sub-agent "${subAgent}"` : ""} has no available model. This is a configuration error.`,
    });
  }
}

export class AgentAccountUnavailableError extends HTTPException {
  constructor(agentCode: string, subAgent?: string) {
    super(503, {
      message: `AI Agent "${agentCode}"${subAgent ? ` sub-agent "${subAgent}"` : ""} has an eligible model, but no active provider account with an active API key is available. Configure an active account, concurrency limit, and key for the model's provider.`,
    });
  }
}

function currentPrice(pricing?: PricingRates[]): number {
  const p = pricing?.[0];
  if (!p) return Number.POSITIVE_INFINITY;
  return p.input + p.output;
}

function normalizeTimeRange(start: number, end: number): TimeInterval[] {
  if (start === 0 && end === MINUTES_PER_DAY) return [[0, MINUTES_PER_DAY]];
  if (start < end) return [[start, end]];

  const intervals: TimeInterval[] = [[start, MINUTES_PER_DAY]];
  if (end > 0) intervals.push([0, end]);
  return intervals;
}

function getMinutesInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function resolvePolicyForNow(
  pricing: {
    timeZone: string;
    policy: unknown;
  },
  now: Date,
): PricingRates | null {
  const localMinutes = getMinutesInTimeZone(now, pricing.timeZone);
  const policy = pricingPolicySchema.parse(pricing.policy);
  const item = policy.find((policyItem) =>
    normalizeTimeRange(policyItem.startMinutes, policyItem.endMinutes).some(
      ([start, end]) => start <= localMinutes && localMinutes < end,
    ),
  );
  return item
    ? {
        input: item.input,
        cachedInput: item.cachedInput,
        output: item.output,
      }
    : null;
}

/**
 * Computes the billed cost from token usage and a model's effective pricing.
 * Rates are per 1,000,000 tokens and are expressed in the provider account's
 * `currency` (the value recorded on the usage event). Cached input tokens are
 * billed at the cheaper `cachedInput` rate and subtracted from the total input
 * count to avoid double billing.
 */
export function computeUsageCost(
  pricing: PricingRates,
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  },
): number {
  const PER_MILLION = 1_000_000;
  const nonCachedInput = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens,
  );
  const raw =
    (nonCachedInput / PER_MILLION) * pricing.input +
    (usage.cachedInputTokens / PER_MILLION) * pricing.cachedInput +
    (usage.outputTokens / PER_MILLION) * pricing.output;
  return Math.round(raw * 1e6) / 1e6;
}

export async function resolveAgentModel(params: {
  agentCode: string;
  subAgent: string;
  principal: Principal;
}): Promise<ResolvedAgentRuntime> {
  const now = new Date();

  const agent = await prisma.aiAgent.findUnique({
    where: { code: params.agentCode },
  });
  if (agent?.status !== "active") {
    throw new HTTPException(404, { message: "Agent not found." });
  }

  // Check user quota for this agent's feature. The feature code matches the
  // agent code so the plan subscription grants access to specific agents.
  const hasFeature = await hasActiveFeatureForUser(
    params.principal.id,
    params.agentCode,
  );
  if (!hasFeature) {
    throw new AgentNotEntitledError(params.agentCode);
  }

  const subAgents = subAgentsSchema.parse(agent.subAgents);
  const subAgent = subAgents[params.subAgent];
  if (!subAgent) {
    throw new AgentModelUnavailableError(params.agentCode, params.subAgent);
  }

  const models = await prisma.aiModel.findMany({
    where: {
      modelId: subAgent.modelId,
      enabled: true,
      provider: { enabled: true },
    },
    include: {
      provider: {
        include: {
          accounts: {
            where: {
              account: {
                status: "active",
                concurrencyLimit: { gt: 0 },
                keys: {
                  some: {
                    status: "active",
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                },
              },
            },
            include: {
              account: {
                include: {
                  keys: {
                    where: {
                      status: "active",
                      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (models.length === 0) {
    throw new AgentModelUnavailableError(params.agentCode, params.subAgent);
  }

  type ModelRow = (typeof models)[number];
  type AccountRow = ModelRow["provider"]["accounts"][number]["account"];
  type KeyRow = AccountRow["keys"][number];

  const triples: Array<{
    model: ModelRow;
    account: AccountRow;
    key: KeyRow;
  }> = [];
  for (const model of models) {
    for (const link of model.provider.accounts) {
      const account = link.account;
      const key = account.keys[0];
      if (key) triples.push({ model, account, key });
    }
  }

  if (triples.length === 0) {
    throw new AgentAccountUnavailableError(params.agentCode, params.subAgent);
  }

  const pricingRows = await prisma.aiModelPricing.findMany({
    where: {
      AND: [
        {
          OR: triples.map((t) => ({
            modelId: t.model.id,
            accountId: t.account.id,
          })),
        },
        {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      ],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const pricingByPair = new Map<string, PricingRates[]>();
  for (const row of pricingRows) {
    const pricing = resolvePolicyForNow(row, now);
    if (!pricing) continue;
    const key = `${row.modelId}:${row.accountId}`;
    if (!pricingByPair.has(key)) {
      pricingByPair.set(key, [pricing]);
    }
  }

  triples.sort((a, b) => {
    const ua = accountConcurrencyTracker.utilization(
      a.account.id,
      a.account.concurrencyLimit,
    );
    const ub = accountConcurrencyTracker.utilization(
      b.account.id,
      b.account.concurrencyLimit,
    );
    if (ua !== ub) return ua - ub;
    return (
      currentPrice(pricingByPair.get(`${a.model.id}:${a.account.id}`)) -
      currentPrice(pricingByPair.get(`${b.model.id}:${b.account.id}`))
    );
  });

  const chosen = triples[0];
  const chosenPricing =
    pricingByPair.get(`${chosen.model.id}:${chosen.account.id}`)?.[0] ?? null;

  // Effective allowed APIs come from the agent. Empty means no API tools.
  const allowedApis = agent.allowedApis
    ? z.array(z.string()).parse(agent.allowedApis)
    : [];

  return {
    agent: {
      id: agent.id,
      systemPrompt: subAgent.systemPrompt ?? null,
      reasoning: subAgent.reasoning ?? null,
      maxSteps: subAgent.maxSteps ?? 8,
      temperature: subAgent.temperature ?? null,
    },
    subAgent,
    allowedApis,
    endpoint: {
      aiAdapter: chosen.model.provider.aiAdapter,
      baseUrl: chosen.model.provider.baseUrl,
      apiKey: decryptSecret(chosen.key.encryptedSecret),
      modelId: chosen.model.modelId,
    },
    aiModelId: chosen.model.id,
    accountId: chosen.account.id,
    accountConcurrencyLimit: chosen.account.concurrencyLimit,
    currency: chosen.account.currency,
    pricing: chosenPricing,
  };
}
