import type { LanguageModelUsage } from "ai";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import {
  releaseForAiUsage,
  reserveForAiUsage,
  type resolveBilling,
  settleForAiUsage,
} from "#modules/billing/billing.service";
import { accountConcurrencyTracker } from "./account-concurrency";
import {
  computeUsageCost,
  type ResolvedAgentRuntime,
} from "./agent-resolution.service";

export interface TrackedAiCallInput {
  systemPrompt: string | null;
  prompt: string;
  params?: Record<string, unknown>;
}

function asJson(value: object): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonCompatible(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => jsonCompatible(item))
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, jsonCompatible(item)] as const)
        .filter(([, item]) => item !== undefined),
    );
  }
  return undefined;
}

function pickJsonFields(
  value: unknown,
  fields: string[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const picked = Object.fromEntries(
    fields
      .map((field) => [field, jsonCompatible(value[field])] as const)
      .filter(([, item]) => item !== undefined),
  );
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function failureOutput(err: unknown): Record<string, unknown> | null {
  if (!isRecord(err)) return null;

  const output = Object.fromEntries(
    [
      ["text", jsonCompatible(err.text)],
      ["object", jsonCompatible(err.object)],
      ["finishReason", jsonCompatible(err.finishReason)],
      ["usage", jsonCompatible(err.usage)],
      [
        "response",
        pickJsonFields(err.response, ["id", "modelId", "timestamp"]),
      ],
    ].filter(([, value]) => value !== undefined),
  );

  return Object.keys(output).length > 0 ? output : null;
}

function normalizeUsage(usage: LanguageModelUsage) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

/**
 * Runs a single-shot AI call with full usage/content tracking. Creates the
 * `ai_usage_event` row (status `pending`, recording the input snapshot),
 * reserves credits, invokes `fn`, then records tokens/cost plus the returned
 * output snapshot on the same row and settles the reservation. On failure the
 * event is marked `failed` with the error recorded and the reservation
 * refunded.
 *
 * Conversation-style streaming calls keep their own lifecycle (see
 * `sendMessageHandler`) — their transcript lives in `ai_message`; their usage
 * event records an input snapshot (rendered user prompt) but no output.
 */
export async function executeTrackedAiCall<
  T extends { usage: LanguageModelUsage },
>(params: {
  userId: string;
  resolved: ResolvedAgentRuntime;
  billing: Awaited<ReturnType<typeof resolveBilling>>;
  input: TrackedAiCallInput;
  fn: () => Promise<{
    result: T;
    output?: Record<string, unknown> | null;
  }>;
}): Promise<T> {
  const { userId, resolved, billing, input, fn } = params;

  await accountConcurrencyTracker.acquire(
    resolved.accountId,
    resolved.accountConcurrencyLimit,
  );
  let released = false;
  const releaseSlot = () => {
    if (!released) {
      released = true;
      accountConcurrencyTracker.release(resolved.accountId);
    }
  };

  const startTime = Date.now();

  try {
    const usageEvent = await prisma.aiUsageEvent.create({
      data: {
        userId,
        agentId: resolved.agent.id,
        modelId: resolved.aiModelId,
        accountId: resolved.accountId,
        status: "pending",
        input: asJson(input),
      },
    });

    let reservedAmount: number;
    try {
      ({ reservedAmount } = await reserveForAiUsage({
        userId,
        billing,
        usageEventId: usageEvent.id,
      }));
    } catch (err) {
      await prisma.aiUsageEvent
        .update({
          where: { id: usageEvent.id },
          data: { status: "failed", error: errorMessage(err) },
        })
        .catch(() => {});
      throw err;
    }

    try {
      const { result, output } = await fn();
      const usage = normalizeUsage(result.usage);
      const cost = resolved.pricing
        ? computeUsageCost(resolved.pricing, {
            inputTokens: usage.inputTokens,
            cachedInputTokens: usage.cachedInputTokens,
            outputTokens: usage.outputTokens,
          })
        : 0;

      await prisma.aiUsageEvent.update({
        where: { id: usageEvent.id },
        data: {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
          reasoningTokens: usage.reasoningTokens,
          cost,
          currency: resolved.currency,
          latencyMs: Date.now() - startTime,
          status: "ok",
          ...(output ? { output: asJson(output) } : {}),
        },
      });

      await settleForAiUsage({
        userId,
        billing,
        usageEventId: usageEvent.id,
        reservedAmount,
        cost,
        currency: resolved.currency,
      });

      return result;
    } catch (err) {
      const output = failureOutput(err);
      await prisma.aiUsageEvent
        .update({
          where: { id: usageEvent.id },
          data: {
            status: "failed",
            error: errorMessage(err),
            ...(output ? { output: asJson(output) } : {}),
          },
        })
        .catch(() => {});
      await releaseForAiUsage({
        userId,
        billing,
        usageEventId: usageEvent.id,
        reservedAmount,
      }).catch((releaseErr) => {
        console.error("[ai] failed to release reserved credits:", releaseErr);
      });
      throw err;
    }
  } finally {
    releaseSlot();
  }
}
