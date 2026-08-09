import { z } from "zod";
import {
  buildConfigIndex,
  type ConfigRegistryEntry,
} from "#lib/config-registry";

// `""` denotes "unset → fall back to env" (mergeEnvFallback); accepting it lets
// the API restore the seeded default and lets the admin UI save a cleared field.
const boolValue = z.enum(["true", "false", ""]);
const jsonStringArrayValue = z.string().refine((s) => {
  try {
    const parsed: unknown = JSON.parse(s);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string");
  } catch {
    return false;
  }
}, "Must be a JSON array of strings");

/**
 * The single source of truth for per-application config keys (the
 * `application_config` table). Each app gets its own copy of every seeded
 * entry via `prisma/seed.ts`.
 *
 * `ai-agent.allowedApis` is `seed: false`: it is a valid write target (managed
 * by `replaceAllowedApis`) but is created on demand rather than seeded, so a
 * missing row still means "not configured" (`loadAiAgentConfig` → `null`).
 */
export const APPLICATION_CONFIG_REGISTRY: ConfigRegistryEntry[] = [
  // --- ai-agent (functional) ---
  {
    group: "ai-agent",
    key: "baseURL",
    defaultValue: "",
    type: "string",
    label: "settings.fields.aiAgentBaseURL",
    description: "settings.fieldsDesc.aiAgentBaseURL",
    isSecret: false,
    sortOrder: 0,
    valueSchema: z.string(),
  },
  {
    group: "ai-agent",
    key: "apiKey",
    defaultValue: "",
    type: "string",
    label: "settings.fields.aiAgentApiKey",
    description: "settings.fieldsDesc.aiAgentApiKey",
    isSecret: true,
    mask: "start{4}.{*}end{4}",
    sortOrder: 1,
    valueSchema: z.string(),
  },
  {
    group: "ai-agent",
    key: "model",
    defaultValue: "",
    type: "string",
    label: "settings.fields.aiAgentModel",
    description: "settings.fieldsDesc.aiAgentModel",
    isSecret: false,
    sortOrder: 2,
    valueSchema: z.string(),
  },
  {
    group: "ai-agent",
    key: "reasoning",
    defaultValue: "",
    type: "select",
    label: "settings.fields.aiAgentReasoning",
    description: "settings.fieldsDesc.aiAgentReasoning",
    schema: {
      options: [
        { value: "off", label: "settings.aiAgentReasoningOptions.off" },
        { value: "minimal", label: "settings.aiAgentReasoningOptions.minimal" },
        { value: "low", label: "settings.aiAgentReasoningOptions.low" },
        { value: "medium", label: "settings.aiAgentReasoningOptions.medium" },
        { value: "high", label: "settings.aiAgentReasoningOptions.high" },
        { value: "xhigh", label: "settings.aiAgentReasoningOptions.xhigh" },
      ],
    },
    isSecret: false,
    sortOrder: 3,
    valueSchema: z.enum([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "",
    ]),
  },

  // --- ai-agent-ui (visual) ---
  // Seeded with an empty value so the env fallback
  // (AI_AGENT_UI_SHOW_REASONING / AI_AGENT_UI_SHOW_TOOL_CALLS) takes
  // precedence; when env is also unset, the loader treats empty as "not shown".
  {
    group: "ai-agent-ui",
    key: "showReasoning",
    defaultValue: "",
    type: "boolean",
    label: "settings.fields.aiAgentShowReasoning",
    description: "settings.fieldsDesc.aiAgentShowReasoning",
    isSecret: false,
    sortOrder: 0,
    valueSchema: boolValue,
  },
  {
    group: "ai-agent-ui",
    key: "showToolCalls",
    defaultValue: "",
    type: "boolean",
    label: "settings.fields.aiAgentShowToolCalls",
    description: "settings.fieldsDesc.aiAgentShowToolCalls",
    isSecret: false,
    sortOrder: 1,
    valueSchema: boolValue,
  },

  // --- ai-agent.allowedApis (on-demand, not seeded) ---
  // Written by `replaceAllowedApis` when an admin first configures the
  // allowed-API picker. `seed: false` keeps the row absent until then so
  // `loadAiAgentConfig` resolves `allowedApis: null` ("not configured").
  {
    group: "ai-agent",
    key: "allowedApis",
    defaultValue: "[]",
    seed: false,
    type: "json",
    label: "Allowed APIs",
    description: "API operationIds the AI Agent may invoke via call_api.",
    isSecret: false,
    sortOrder: 5,
    valueSchema: jsonStringArrayValue,
  },
];

export const APPLICATION_CONFIG_INDEX = buildConfigIndex(
  APPLICATION_CONFIG_REGISTRY,
);
