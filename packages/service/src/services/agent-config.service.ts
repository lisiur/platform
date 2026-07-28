import { getMergedAppConfigRows } from "./application-config.service";

/**
 * AI SDK portable reasoning levels. `off` is sent as `'none'` to disable
 * reasoning entirely; other values map directly to the SDK's
 * `reasoning` parameter, which providers translate to their native API.
 */
export type AiAgentReasoning =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface AiAgentConfig {
  /** OpenAI-compatible endpoint, e.g. https://api.openai.com/v1 or OpenRouter URL. */
  baseURL: string;
  apiKey: string;
  /** Model identifier as understood by the configured endpoint. */
  model: string;
  /** Optional override for the agent's system prompt. Empty uses the default. */
  systemPrompt: string;
  /** Reasoning effort. Set to "off" to disable; omit to let the provider decide. */
  reasoning?: AiAgentReasoning;
}

const VALID_REASONING: AiAgentReasoning[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * Resolves the AI Agent config scoped to a specific application. DB values take
 * precedence over env vars; env vars serve as a deployment-time fallback shared
 * across all apps when the DB value is unset/empty. Empty/whitespace-only
 * values are treated as unset. Env-fallback is applied by `getMergedAppConfigRows`
 * via the shared `AI_AGENT_*` convention.
 */
export async function loadAiAgentConfig(appId: string): Promise<AiAgentConfig> {
  const map = new Map(
    (await getMergedAppConfigRows(appId, "ai-agent")).map((r) => [
      r.key,
      r.value,
    ]),
  );

  const rawReasoning = (map.get("reasoning") ?? "").toLowerCase();
  const reasoning = VALID_REASONING.includes(rawReasoning as AiAgentReasoning)
    ? (rawReasoning as AiAgentReasoning)
    : undefined;

  return {
    baseURL: map.get("baseURL") ?? "",
    apiKey: map.get("apiKey") ?? "",
    model: map.get("model") ?? "",
    systemPrompt: map.get("systemPrompt") ?? "",
    reasoning,
  };
}

/** True when an endpoint, key, and model are all configured. */
export function isAgentConfigured(config: AiAgentConfig): boolean {
  return (
    config.baseURL.length > 0 &&
    config.apiKey.length > 0 &&
    config.model.length > 0
  );
}
