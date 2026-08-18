import { z } from "zod";
import {
  buildConfigIndex,
  type ConfigRegistryEntry,
} from "#lib/config-registry";

// `""` denotes "unset → fall back to env" (mergeEnvFallback); accepting it lets
// the API restore the seeded default and lets the admin UI save a cleared field.
const boolValue = z.enum(["true", "false", ""]);

/**
 * The single source of truth for per-application config keys (the
 * `application_config` table). Each app gets its own copy of every seeded
 * entry via `src/seed.ts`.
 */
export const APPLICATION_CONFIG_REGISTRY: ConfigRegistryEntry[] = [
  // --- ai-agent-ui (visual) ---
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
];

export const APPLICATION_CONFIG_INDEX = buildConfigIndex(
  APPLICATION_CONFIG_REGISTRY,
);
