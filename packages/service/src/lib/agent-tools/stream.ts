import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Context, ToolSet } from "@ai-sdk/provider-utils";
import { type ModelMessage, stepCountIs, streamText } from "ai";
import type { AiAgentConfig } from "#services/agent-config.service";
import { platformToolCatalogue, platformTools } from "./index";

/**
 * Builds the system prompt for the agent. Uses the override from config if
 * provided; otherwise a generic read-only-platform-introspection prompt.
 */
export function buildSystemPrompt(
  config: Pick<AiAgentConfig, "systemPrompt">,
): string {
  const override = config.systemPrompt.trim();
  if (override) return override;
  return [
    "You are the platform AI Agent — a read-only operations assistant for this platform.",
    "You help administrators inspect and understand the running system: the background job queue,",
    "the in-memory cache, the rate limiter, and host health.",
    "",
    "Guidelines:",
    "- You have NO filesystem, shell, or write access. Do not attempt to modify anything.",
    "- Use the provided tools to gather facts, then answer concisely with concrete numbers.",
    "- Prefer calling `platform_overview` first, then drill into specifics as needed.",
    "- When reporting figures, round sensibly and include units. Do not invent data.",
    "",
    "Available tools:",
    platformToolCatalogue,
  ].join("\n");
}

export interface StreamAgentParams {
  config: AiAgentConfig;
  messages: ModelMessage[];
  abortSignal: AbortSignal;
  /** Max tool-call steps before the model must finalise. */
  maxSteps?: number;
}

/**
 * Streams a response from an OpenAI-compatible endpoint using the read-only
 * platform tools. Returns the AI SDK's `StreamTextResult`, which exposes the
 * `toUIMessageStreamResponse()` helper used by the route handler.
 */
export function streamAgent({
  config,
  messages,
  abortSignal,
  maxSteps = 8,
}: StreamAgentParams): ReturnType<typeof streamText<ToolSet, Context>> {
  const openai = createOpenAICompatible({
    name: "platform-agent",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });

  return streamText({
    model: openai(config.model),
    system: buildSystemPrompt(config),
    messages,
    tools: platformTools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    // Portable reasoning option. `off` -> `'none'` disables it; other
    // levels are translated by the provider to its native API
    // (`reasoning_effort` for openai-compatible, `thinking` for Anthropic, etc.).
    reasoning:
      config.reasoning === "off" || !config.reasoning
        ? "none"
        : config.reasoning,
  });
}
