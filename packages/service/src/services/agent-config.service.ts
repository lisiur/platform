import { HTTPException } from "hono/http-exception";
import {
  getMergedAppConfigRows,
  upsertAppConfig,
} from "./application-config.service";
import {
  findOperation,
  listAvailableOperations,
  type OperationDescriptor,
} from "./openapi.service";

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
  /** Reasoning effort. Set to "off" to disable; omit to let the provider decide. */
  reasoning?: AiAgentReasoning;
  /** Allowed API operationIds the agent's `call_api` tool may invoke.
      Null means not configured; empty array means explicitly configured as empty. */
  allowedApis: string[] | null;
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

  const rawAllowedApis = map.get("allowedApis") ?? "";
  let allowedApis: string[] | null = null;
  if (rawAllowedApis) {
    try {
      const parsed: unknown = JSON.parse(rawAllowedApis);
      allowedApis = Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      allowedApis = [];
    }
  }

  return {
    baseURL: map.get("baseURL") ?? "",
    apiKey: map.get("apiKey") ?? "",
    model: map.get("model") ?? "",
    reasoning,
    allowedApis,
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

/** Reads an app's allowed API operationIds from its ai-agent config.
    Returns null when not configured. */
export async function getAllowedApis(appId: string): Promise<string[] | null> {
  return (await loadAiAgentConfig(appId)).allowedApis;
}

/** All operations in the platform spec, for the admin picker. */
export async function listAvailableApis(): Promise<OperationDescriptor[]> {
  return listAvailableOperations().catch((err) => {
    throw new HTTPException(502, {
      message: `Failed to load OpenAPI spec: ${err instanceof Error ? err.message : String(err)}`,
    });
  });
}

/**
 * Validate and persist an app's allowed API operationIds. Each operationId must
 * exist in the live platform spec; unknown ids are rejected with a 400. Stored
 * as a single JSON-array config row under the ai-agent group.
 */
export async function replaceAllowedApis(
  appId: string,
  operationIds: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const id of operationIds) {
    if (!(await findOperation(id))) {
      throw new HTTPException(400, { message: `Unknown operationId: ${id}` });
    }
    if (seen.has(id)) {
      throw new HTTPException(400, { message: `Duplicate operationId: ${id}` });
    }
    seen.add(id);
    normalized.push(id);
  }

  await upsertAppConfig(appId, "ai-agent", "allowedApis", {
    value: JSON.stringify(normalized),
    type: "json",
    label: "Allowed APIs",
    description: "API operationIds the AI Agent may invoke via call_api.",
    sortOrder: 5,
  });

  return normalized;
}
