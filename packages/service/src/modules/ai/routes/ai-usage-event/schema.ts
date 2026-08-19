import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

const userRefSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  })
  .nullable()
  .optional();

const agentRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
  })
  .nullable()
  .optional();

const modelRefSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    modelId: z.string(),
  })
  .nullable()
  .optional();

const accountRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .nullable()
  .optional();

export const aiUsageEventSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    userId: z.string().nullable().openapi({ example: "clxUser" }),
    agentId: z.string().nullable().openapi({ example: "clxAgent" }),
    modelId: z.string().openapi({ example: "clxModel" }),
    accountId: z.string().openapi({ example: "clxAccount" }),
    inputTokens: z.number().int().openapi({ example: 1200 }),
    cachedInputTokens: z.number().int().openapi({ example: 0 }),
    outputTokens: z.number().int().openapi({ example: 340 }),
    reasoningTokens: z.number().int().openapi({ example: 0 }),
    cost: z.number().openapi({ example: 0.0021 }),
    currency: z.string().openapi({ example: "USD" }),
    latencyMs: z.number().int().nullable().openapi({ example: 1250 }),
    status: z.string().openapi({ example: "ok" }),
    createdAt: z.date(),
    user: userRefSchema,
    agent: agentRefSchema,
    model: modelRefSchema,
    account: accountRefSchema,
  })
  .openapi("AiUsageEvent");

// Detail view additionally carries the recorded content audit trail. Single-shot
// calls record input + output; conversation streaming calls record an input
// snapshot (system prompt + rendered user prompt) while the full transcript
// lives in ai_message. The columns are Prisma JsonValue, so they are typed
// loosely here and their shape is documented via examples.
export const aiUsageEventDetailSchema = aiUsageEventSchema
  .extend({
    input: z
      .unknown()
      .nullable()
      .openapi({
        example: {
          systemPrompt: "You are an assistant.",
          prompt: "Translate: check",
          params: { temperature: 0.7 },
        },
      }),
    output: z
      .unknown()
      .nullable()
      .openapi({
        example: { text: '{"translation":"检查"}', finishReason: "stop" },
      }),
    error: z.string().nullable().openapi({ example: null }),
  })
  .openapi("AiUsageEventDetail");

export const listAiUsageEventsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  modelId: z.string().optional(),
  accountId: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const aiUsageEventIdParamSchema = idParamSchema();

export const listAiUsageEventsResponseSchema = z
  .object({
    events: aiUsageEventSchema.array(),
    total: z.number(),
  })
  .openapi("ListAiUsageEventsResponse");

export const deleteAiUsageEventsBodySchema = z.object({
  ids: z.string().array().min(1).max(100),
});

export const deleteAiUsageEventsResponseSchema = z
  .object({
    success: z.literal(true),
    count: z.number(),
  })
  .openapi("DeleteAiUsageEventsResponse");
