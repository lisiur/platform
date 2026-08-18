import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { AiReasoningLevel } from "@repo/shared";
import type { LanguageModel } from "ai";

export interface ProviderEndpoint {
  aiAdapter: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  openai_compatible: "openai-compatible",
};

/** Builds a LanguageModel for the resolved endpoint. */
export function createProviderModel({
  aiAdapter,
  baseUrl,
  apiKey,
  modelId,
}: ProviderEndpoint): LanguageModel {
  if (aiAdapter === "anthropic") {
    const provider = createAnthropic({
      baseURL: baseUrl,
      apiKey,
    });
    return provider(modelId);
  }

  const provider = createOpenAICompatible({
    name: PROVIDER_NAMES[aiAdapter] ?? "platform",
    baseURL: baseUrl,
    apiKey,
  });
  return provider(modelId);
}

/**
 * Hybrid reasoning models behind OpenAI-compatible endpoints (GLM, DeepSeek,
 * Qwen, ...) think by default: `reasoning: "none"` only omits
 * `reasoning_effort`, which does not disable them. Their native switch is
 * `thinking: { type: "disabled" }` (DeepSeek uses the same shape). First-party
 * `openai` / `anthropic` adapters are excluded: their APIs reject unknown
 * params, and Anthropic already maps "none" to no thinking.
 */
export function buildDisableThinkingOptions(
  endpoint: ProviderEndpoint,
  reasoning: AiReasoningLevel | null,
): ProviderOptions | undefined {
  if (reasoning !== "none") return undefined;
  if (endpoint.aiAdapter === "openai" || endpoint.aiAdapter === "anthropic")
    return undefined;
  const key = PROVIDER_NAMES[endpoint.aiAdapter] ?? "platform";
  return { [key]: { thinking: { type: "disabled" } } };
}
