import { randomUUID } from "node:crypto";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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
import { requireAppId } from "#extractors/current-app";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import type { Prisma } from "#generated/prisma/client";
import { streamAgent } from "#lib/ai-agent/agent";
import { prisma } from "#lib/db";
import {
  isAgentConfigured,
  loadAiAgentConfig,
} from "#services/agent-config.service";
import {
  AgentSessionNotFoundError,
  agentSessionManager,
} from "#services/agent-session.service";
import { assertAccess } from "#services/role-permission.service";
import { eventBus } from "#states";

const promptRequestSchema = z.object({
  prompt: z.string().trim().min(1),
});

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
  config: { baseURL: string; apiKey: string; model: string },
  userId: string,
): Promise<void> {
  const openai = createOpenAICompatible({
    name: "platform-agent-title",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });

  const result = await generateText({
    model: openai(config.model),
    system:
      "Generate a short title (5-6 words max) summarizing the user's first message below. Return only the title, no quotes or punctuation.",
    prompt: userPrompt,
    // Reasoning models (e.g., DeepSeek-R1, QwQ) ignore `reasoning: "none"` and
    // spend output tokens on <think> blocks. A tight cap starves the actual
    // text output, so leave enough headroom for reasoning + the short title.
    maxOutputTokens: 1000,
    reasoning: "none",
  });

  const title = result.text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
  if (!title) return;

  await agentSessionManager.updateName(sessionId, title);

  eventBus.publish({
    type: "agent.session.title.updated",
    target: `sse:admin:${userId}:*`,
    sessionId,
    name: title,
  });
}

export async function sendMessageHandler(c: Context) {
  const principal = await requirePrincipal(c);
  const scope = principalScope(principal);
  await assertAccess(
    principal,
    scope === "system" ? "system/agent:chat" : "org/agent:chat",
    scope,
  );
  const userId = getPrincipalUserId(principal);
  const appId = await requireAppId(c);
  const id = c.req.param("id") ?? "";

  try {
    await agentSessionManager.ensureSession(id, userId);
  } catch (err) {
    if (err instanceof AgentSessionNotFoundError) {
      throw new HTTPException(404, { message: "Agent session not found" });
    }
    throw err;
  }

  const parsed = promptRequestSchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "A non-empty 'prompt' is required.",
    });
  }
  const userText = parsed.data.prompt;

  const config = await loadAiAgentConfig(appId);
  if (!isAgentConfigured(config)) {
    throw new HTTPException(503, { message: "AI Agent is not configured." });
  }

  const rows = await prisma.agentMessage.findMany({
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

  const userMessage: UIMessage = {
    id: randomUUID(),
    role: "user",
    parts: [{ type: "text", text: userText }],
  };
  priorMessages.push(userMessage);
  await prisma.agentMessage.create({
    data: {
      id: userMessage.id,
      sessionId: id,
      role: "user",
      parts: asJson(userMessage.parts),
    },
  });

  if (isFirstMessage && config.apiKey) {
    const cfg = {
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
    };
    generateAndSaveTitle(id, userText, cfg, userId).catch((err) => {
      console.error("[agent] failed to generate title:", err);
    });
  }

  const modelMessages = await convertToModelMessages(priorMessages);

  const apiOrigin = process.env.API_ORIGIN ?? new URL(c.req.url).origin;
  const forwardedHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    forwardedHeaders[key.toLowerCase()] = value;
  });

  const result = await streamAgent({
    config,
    messages: modelMessages,
    abortSignal: c.req.raw.signal,
    apiOrigin,
    sessionId: id,
    forwardedHeaders,
  });

  const knownIds = new Set(priorMessages.map((m) => m.id));

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: priorMessages,
      generateMessageId: randomUUID,
      onError: (error) => {
        console.error("[agent] stream error:", error);
        return process.env.NODE_ENV === "production"
          ? "An error occurred."
          : error instanceof Error
            ? error.message
            : String(error);
      },
      onFinish: async ({ messages, isAborted }) => {
        if (isAborted) return;
        try {
          const newRows: PersistedMessage[] = messages
            .filter((m) => !knownIds.has(m.id))
            .map((m) => ({
              id: m.id,
              role: m.role === "user" ? "user" : "assistant",
              parts: m.parts,
            }));
          if (newRows.length === 0) return;
          await prisma.agentMessage.createMany({
            data: newRows.map((row) => ({
              id: row.id,
              sessionId: id,
              role: row.role,
              parts: asJson(row.parts),
            })),
          });
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
      },
    }),
  });
}
