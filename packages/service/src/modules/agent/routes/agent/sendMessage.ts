import { randomUUID } from "node:crypto";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireCurrentApp } from "#extractors/current-app";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import type { Prisma } from "#generated/prisma/client";
import { streamAgent } from "#lib/ai-agent/agent";
import { createProviderModel } from "#lib/ai-agent/provider-adapter";
import { prisma } from "#lib/db";
import { accountConcurrencyTracker } from "#modules/agent/account-concurrency";
import {
  computeUsageCost,
  resolveAgentModel,
} from "#modules/agent/agent-resolution.service";
import {
  type AgentToolResultInput,
  AiConversationNotFoundError,
  aiConversationManager,
} from "#modules/agent/ai-conversation.service";
import { executeTrackedAiCall } from "#modules/agent/tracked-ai-call";
import {
  BILLING_RESOURCE_AI_AGENT,
  releaseForAiUsage,
  reserveForAiUsage,
  resolveBilling,
  settleForAiUsage,
} from "#modules/billing/billing.service";
import { eventBus } from "#states";
import { PLATFORM_ASSISTANT_FEATURE_CODE } from "./entitlement";

const promptRequestSchema = z.object({
  prompt: z.string().trim().min(1),
});

const toolResultSchema = z.union([
  z.object({
    toolCallId: z.string().trim().min(1),
    output: z.unknown(),
  }),
  z.object({
    toolCallId: z.string().trim().min(1),
    errorText: z.string().trim().min(1),
  }),
]);

const messageRequestSchema = z.union([
  promptRequestSchema,
  z.object({ toolResults: z.array(toolResultSchema).min(1) }),
]);

// Cap a single agent run well under the 2h stale-reservation sweep threshold so
// an in-flight stream can never be swept (and later double-settled).
const AGENT_STREAM_TIMEOUT_MS = 10 * 60 * 1000;

type PersistedMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UIMessage["parts"];
};

/** The Prisma JSON column expects InputJsonValue; UIMessage.parts qualifies as one. */
function asJson(parts: UIMessage["parts"]): Prisma.InputJsonValue {
  return parts as unknown as Prisma.InputJsonValue;
}

async function generateAndSaveTitle(
  sessionId: string,
  userPrompt: string,
  resolved: Awaited<ReturnType<typeof resolveAgentModel>>,
  userId: string,
  appCode: string,
): Promise<void> {
  const billing = await resolveBilling(
    BILLING_RESOURCE_AI_AGENT,
    PLATFORM_ASSISTANT_FEATURE_CODE,
  );

  const result = await executeTrackedAiCall({
    userId,
    resolved,
    billing,
    input: {
      systemPrompt: resolved.agent.systemPrompt,
      prompt: userPrompt,
      params: {
        maxOutputTokens: resolved.subAgent.maxOutputTokens ?? 1000,
        temperature: resolved.agent.temperature ?? undefined,
        reasoning: resolved.agent.reasoning ?? undefined,
      },
    },
    fn: async () => {
      // Arm the timeout only once the slot is acquired and credits are
      // reserved, so queue wait doesn't eat into the generation budget.
      const timeoutController = new AbortController();
      const timer = setTimeout(
        () => timeoutController.abort(),
        AGENT_STREAM_TIMEOUT_MS,
      );
      timer.unref?.();
      try {
        const model = createProviderModel(resolved.endpoint);
        const result = await generateText({
          model,
          system: resolved.agent.systemPrompt ?? undefined,
          prompt: userPrompt,
          // Reasoning models (e.g., DeepSeek-R1, QwQ) ignore `reasoning: "none"` and
          // spend output tokens on <think> blocks. A tight cap starves the actual
          // text output, so leave enough headroom for reasoning + the short title.
          maxOutputTokens: resolved.subAgent.maxOutputTokens ?? 1000,
          reasoning: resolved.agent.reasoning ?? undefined,
          temperature: resolved.agent.temperature ?? undefined,
          abortSignal: timeoutController.signal,
        });
        return {
          result,
          output: { text: result.text, finishReason: result.finishReason },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  });

  const title = result.text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();

  if (title) {
    await aiConversationManager.updateName(sessionId, title);
    eventBus.publish({
      type: "agent.session.title.updated",
      target: `sse:${appCode}:${userId}:*`,
      sessionId,
      name: title,
    });
  }
}

export async function sendMessageHandler(c: Context) {
  const principal = await requirePrincipal(c);
  const userId = getPrincipalUserId(principal);
  const currentApp = await requireCurrentApp(c);
  const appId = currentApp.id;
  const appCode = currentApp.code;
  const id = c.req.param("id") ?? "";

  try {
    await aiConversationManager.ensureSession(id, userId, appId);
  } catch (err) {
    if (err instanceof AiConversationNotFoundError) {
      throw new HTTPException(404, { message: "Agent session not found" });
    }
    throw err;
  }

  const parsed = messageRequestSchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "A non-empty 'prompt' or 'toolResults' is required.",
    });
  }

  const resolved = await resolveAgentModel({
    agentCode: PLATFORM_ASSISTANT_FEATURE_CODE,
    subAgent: "chat",
    principal: { type: "user", id: userId },
  });
  const billing = await resolveBilling(
    BILLING_RESOURCE_AI_AGENT,
    PLATFORM_ASSISTANT_FEATURE_CODE,
  );

  if ("toolResults" in parsed.data) {
    await aiConversationManager.applyToolResults(
      id,
      parsed.data.toolResults as AgentToolResultInput[],
    );
  }

  const rows = await prisma.aiMessage.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, parts: true },
  });
  const priorMessages: UIMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: row.parts as UIMessage["parts"],
  }));

  const isFirstMessage = rows.length === 0;

  if ("prompt" in parsed.data) {
    const userText = parsed.data.prompt;
    const userMessage: UIMessage = {
      id: randomUUID(),
      role: "user",
      parts: [{ type: "text", text: userText }],
    };
    priorMessages.push(userMessage);
    await prisma.aiMessage.create({
      data: {
        id: userMessage.id,
        sessionId: id,
        role: "user",
        parts: asJson(userMessage.parts),
      },
    });

    if (isFirstMessage) {
      resolveAgentModel({
        agentCode: PLATFORM_ASSISTANT_FEATURE_CODE,
        subAgent: "title",
        principal: { type: "user", id: userId },
      })
        .then((titleResolved) =>
          generateAndSaveTitle(id, userText, titleResolved, userId, appCode),
        )
        .catch((err) => {
          console.error("[agent] failed to generate title:", err);
        });
    }
  }

  const modelMessages = await convertToModelMessages(priorMessages);

  const apiOrigin = process.env.API_ORIGIN ?? new URL(c.req.url).origin;
  const forwardedHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    forwardedHeaders[key.toLowerCase()] = value;
  });

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
  c.req.raw.signal.addEventListener("abort", releaseSlot, { once: true });

  const timeoutController = new AbortController();
  const streamTimeoutTimer = setTimeout(
    () => timeoutController.abort(),
    AGENT_STREAM_TIMEOUT_MS,
  );
  streamTimeoutTimer.unref?.();
  c.req.raw.signal.addEventListener("abort", () => timeoutController.abort(), {
    once: true,
  });

  const startTime = Date.now();

  const usageEvent = await prisma.aiUsageEvent
    .create({
      data: {
        userId,
        agentId: resolved.agent.id,
        modelId: resolved.aiModelId,
        accountId: resolved.accountId,
        status: "pending",
      },
    })
    .catch((err) => {
      releaseSlot();
      throw err;
    });

  let reservedAmount = 0;
  let reservationSettled = false;

  /** Marks the usage event failed and refunds the reservation in full. */
  const refundReservation = async () => {
    await prisma.aiUsageEvent
      .update({ where: { id: usageEvent.id }, data: { status: "failed" } })
      .catch(() => {});
    await releaseForAiUsage({
      userId,
      billing,
      usageEventId: usageEvent.id,
      reservedAmount,
    }).catch(() => {});
  };

  const settleFailure = async () => {
    if (reservationSettled) return;
    reservationSettled = true;
    await refundReservation();
  };

  try {
    ({ reservedAmount } = await reserveForAiUsage({
      userId,
      billing,
      usageEventId: usageEvent.id,
    }));
  } catch (err) {
    releaseSlot();
    await settleFailure();
    throw err;
  }

  let result: Awaited<ReturnType<typeof streamAgent>>;
  try {
    result = await streamAgent({
      endpoint: resolved.endpoint,
      systemPrompt: resolved.agent.systemPrompt,
      reasoning: resolved.agent.reasoning,
      maxSteps: resolved.agent.maxSteps,
      temperature: resolved.agent.temperature,
      allowedApis: resolved.allowedApis,
      messages: modelMessages,
      abortSignal: timeoutController.signal,
      apiOrigin,
      sessionId: id,
      forwardedHeaders,
    });
  } catch (err) {
    clearTimeout(streamTimeoutTimer);
    releaseSlot();
    await settleFailure();
    throw err;
  }

  /** Bounded wait for the SDK to finalize per-step usage after an interruption. */
  const STEPS_SETTLE_TIMEOUT_MS = 5_000;

  /** Charges the real cost of the steps completed before an interruption
   *  (client disconnect, timeout, stream error) instead of refunding the whole
   *  reservation. Falls back to a full refund when no usage is determinable. */
  const settleInterrupted = async () => {
    if (reservationSettled) return;
    reservationSettled = true;

    const usage = await Promise.race([
      result.steps.then((steps) =>
        steps.reduce(
          (acc, step) => ({
            inputTokens: acc.inputTokens + (step.usage.inputTokens ?? 0),
            cachedInputTokens:
              acc.cachedInputTokens +
              (step.usage.inputTokenDetails?.cacheReadTokens ?? 0),
            outputTokens: acc.outputTokens + (step.usage.outputTokens ?? 0),
            reasoningTokens:
              acc.reasoningTokens +
              (step.usage.outputTokenDetails?.reasoningTokens ?? 0),
          }),
          {
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
          },
        ),
      ),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), STEPS_SETTLE_TIMEOUT_MS),
      ),
    ]).catch(() => null);

    if (
      !usage ||
      (usage.inputTokens === 0 &&
        usage.cachedInputTokens === 0 &&
        usage.outputTokens === 0 &&
        usage.reasoningTokens === 0)
    ) {
      await refundReservation();
      return;
    }

    const cost = resolved.pricing
      ? computeUsageCost(resolved.pricing, {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
        })
      : 0;

    await prisma.aiUsageEvent
      .update({
        where: { id: usageEvent.id },
        data: {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
          reasoningTokens: usage.reasoningTokens,
          cost,
          currency: resolved.currency,
          latencyMs: Date.now() - startTime,
          status: "aborted",
        },
      })
      .catch(() => {});

    await settleForAiUsage({
      userId,
      billing,
      usageEventId: usageEvent.id,
      reservedAmount,
      cost,
      currency: resolved.currency,
    }).catch(async (err) => {
      console.error("[agent] failed to settle interrupted usage:", err);
      await refundReservation();
    });
  };

  const knownIds = new Set(priorMessages.map((m) => m.id));
  const knownMessageParts = new Map(
    priorMessages.map((m) => [m.id, JSON.stringify(m.parts)]),
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: priorMessages,
      generateMessageId: randomUUID,
      onError: (error) => {
        clearTimeout(streamTimeoutTimer);
        releaseSlot();
        void settleInterrupted();
        console.error("[agent] stream error:", error);
        return process.env.NODE_ENV === "production"
          ? "An error occurred."
          : error instanceof Error
            ? error.message
            : String(error);
      },
      onFinish: async ({ messages, isAborted }) => {
        clearTimeout(streamTimeoutTimer);
        releaseSlot();
        if (isAborted) {
          await settleInterrupted();
          return;
        }
        try {
          const rowsToPersist: PersistedMessage[] = messages.map((m) => ({
            id: m.id,
            role: m.role === "user" ? "user" : "assistant",
            parts: m.parts,
          }));
          const updatedRows = rowsToPersist.filter(
            (row) =>
              knownIds.has(row.id) &&
              row.role === "assistant" &&
              knownMessageParts.get(row.id) !== JSON.stringify(row.parts),
          );
          const newRows = rowsToPersist.filter((row) => !knownIds.has(row.id));
          if (newRows.length > 0 || updatedRows.length > 0) {
            await prisma.$transaction([
              ...updatedRows.map((row) =>
                prisma.aiMessage.update({
                  where: { id: row.id },
                  data: { parts: asJson(row.parts) },
                }),
              ),
              ...(newRows.length > 0
                ? [
                    prisma.aiMessage.createMany({
                      data: newRows.map((row) => ({
                        id: row.id,
                        sessionId: id,
                        role: row.role,
                        parts: asJson(row.parts),
                      })),
                    }),
                  ]
                : []),
            ]);
          }
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? String(err.code)
              : "unknown";
          console.error(
            `[agent] failed to persist assistant messages [${code}]:`,
            err,
          );
        }

        try {
          const usage = await result.totalUsage;
          const inputTokens = usage.inputTokens ?? 0;
          const cachedInputTokens =
            usage.inputTokenDetails?.cacheReadTokens ?? 0;
          const outputTokens = usage.outputTokens ?? 0;
          const reasoningTokens =
            usage.outputTokenDetails?.reasoningTokens ?? 0;
          const cost = resolved.pricing
            ? computeUsageCost(resolved.pricing, {
                inputTokens,
                cachedInputTokens,
                outputTokens,
              })
            : 0;

          await prisma.aiUsageEvent.update({
            where: { id: usageEvent.id },
            data: {
              inputTokens,
              cachedInputTokens,
              outputTokens,
              reasoningTokens,
              cost,
              currency: resolved.currency,
              latencyMs: Date.now() - startTime,
              status: "ok",
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
          reservationSettled = true;
        } catch (err) {
          console.error("[agent] failed to record usage:", err);
          await settleFailure();
        }
      },
    }),
  });
}
