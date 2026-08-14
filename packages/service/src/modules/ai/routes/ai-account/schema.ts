import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const aiAccountSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    providerIds: z
      .string()
      .array()
      .openapi({ example: ["clxProvider"] }),
    name: z.string().openapi({ example: "Main OpenAI account" }),
    balance: z.number().openapi({ example: 100 }),
    currency: z.string().openapi({ example: "USD" }),
    concurrencyLimit: z.number().int().openapi({ example: 4 }),
    status: z.string().openapi({ example: "active" }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AiAccount");

export const createAiAccountBodySchema = z.object({
  providerIds: z.string().array().min(1),
  name: z.string().min(1),
  balance: z.number().optional(),
  currency: z.string().optional(),
  concurrencyLimit: z.number().int().min(0).optional(),
  status: z.string().optional(),
});

export const updateAiAccountBodySchema = z.object({
  name: z.string().min(1).optional(),
  providerIds: z.string().array().min(1).optional(),
  balance: z.number().optional(),
  currency: z.string().optional(),
  concurrencyLimit: z.number().int().min(0).optional(),
  status: z.string().optional(),
});

export const listAiAccountsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  providerId: z.string().optional(),
});

export const aiAccountIdParamSchema = idParamSchema();

export const listAiAccountsResponseSchema = z
  .object({
    accounts: aiAccountSchema.array(),
    total: z.number(),
  })
  .openapi("ListAiAccountsResponse");
