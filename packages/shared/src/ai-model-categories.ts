export const AI_MODEL_CATEGORIES = [
  "chat",
  "reasoning",
  "summary",
  "vision",
  "voice",
  "video",
  "image",
  "transcription",
  "embedding",
] as const;

export type AiModelCategory = (typeof AI_MODEL_CATEGORIES)[number];

export const AI_CATEGORY_VALUES: readonly string[] = AI_MODEL_CATEGORIES;
