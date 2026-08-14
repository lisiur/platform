export const AI_REASONING_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type AiReasoningLevel = (typeof AI_REASONING_LEVELS)[number];

export const AI_AGENT_STATUSES = ["active", "disabled"] as const;

export type AiAgentStatus = (typeof AI_AGENT_STATUSES)[number];
