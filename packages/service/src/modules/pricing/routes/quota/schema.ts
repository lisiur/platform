import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const quotaSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    allocated: z.number().int(),
    used: z.number().int(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("UserQuota");

export const updateQuotaBodySchema = z.object({
  allocated: z.number().int().min(0).optional(),
  used: z.number().int().min(0).optional(),
});

export const listQuotasQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const quotaIdParamSchema = idParamSchema();

export const listQuotasResponseSchema = z
  .object({
    quotas: quotaSchema.array(),
    total: z.number(),
  })
  .openapi("ListQuotasResponse");
