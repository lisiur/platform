import { z } from "@hono/zod-openapi";
import { AI_ADAPTERS } from "@repo/shared";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const aiAdapterSchema = z.enum(AI_ADAPTERS);

export const aiProviderSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "OpenAI" }),
    baseUrl: z.url().openapi({ example: "https://api.openai.com/v1" }),
    aiAdapter: aiAdapterSchema,
    enabled: z.boolean().openapi({ example: true }),
    description: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AiProvider");

export const createAiProviderBodySchema = z.object({
  name: z.string().min(1),
  baseUrl: z.url(),
  aiAdapter: aiAdapterSchema,
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export const updateAiProviderBodySchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.url().optional(),
  aiAdapter: aiAdapterSchema.optional(),
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export const listAiProvidersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const aiProviderIdParamSchema = idParamSchema();

export const listAiProvidersResponseSchema = z
  .object({
    providers: aiProviderSchema.array(),
    total: z.number(),
  })
  .openapi("ListAiProvidersResponse");
