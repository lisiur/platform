import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const aiKeySchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    accountId: z.string().openapi({ example: "clxAccount" }),
    name: z.string().openapi({ example: "Production key" }),
    mask: z.string().nullable().openapi({ example: "sk-1…wXyZ" }),
    status: z.string().openapi({ example: "active" }),
    lastUsedAt: z.date().nullable(),
    expiresAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AiKey");

export const createAiKeyBodySchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  secret: z.string().min(1),
  status: z.string().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const updateAiKeyBodySchema = z.object({
  name: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
  status: z.string().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const listAiKeysQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  accountId: z.string().optional(),
});

export const aiKeyIdParamSchema = idParamSchema();

export const listAiKeysResponseSchema = z
  .object({
    keys: aiKeySchema.array(),
    total: z.number(),
  })
  .openapi("ListAiKeysResponse");
