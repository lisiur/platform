import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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
