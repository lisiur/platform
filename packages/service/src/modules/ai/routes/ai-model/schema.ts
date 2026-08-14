import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const aiModelSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    providerId: z.string().openapi({ example: "clxProvider" }),
    modelId: z.string().openapi({ example: "gpt-4o-mini" }),
    displayName: z.string().openapi({ example: "GPT-4o mini" }),
    capabilities: z
      .string()
      .array()
      .openapi({ example: ["tool-use"] }),
    contextWindow: z.number().int().nullable(),
    supportsReasoning: z.boolean().openapi({ example: false }),
    supportsCaching: z.boolean().openapi({ example: false }),
    enabled: z.boolean().openapi({ example: true }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AiModel");

export const createAiModelBodySchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.string().array().optional(),
  contextWindow: z.number().int().nullable().optional(),
  supportsReasoning: z.boolean().optional(),
  supportsCaching: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updateAiModelBodySchema = z.object({
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  capabilities: z.string().array().optional(),
  contextWindow: z.number().int().nullable().optional(),
  supportsReasoning: z.boolean().optional(),
  supportsCaching: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const listAiModelsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  providerId: z.string().optional(),
});

export const aiModelIdParamSchema = idParamSchema();

export const listAiModelsResponseSchema = z
  .object({
    models: aiModelSchema.array(),
    total: z.number(),
  })
  .openapi("ListAiModelsResponse");
