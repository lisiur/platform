export const AI_ADAPTERS = [
  "openai",
  "anthropic",
  "openai_compatible",
] as const;

export type AiAdapter = (typeof AI_ADAPTERS)[number];
