import { z } from "@hono/zod-openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const billingTypeSchema = z.enum(["cost_based", "per_call", "none"]);
export const billingStatusSchema = z.enum(["active", "disabled"]);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export const billingConfigSchema = z
  .object({
    id: z.string(),
    resourceType: z.string(),
    resourceId: z.string(),
    billingType: billingTypeSchema,
    priceUnit: z.string(),
    priceAmount: z.number(),
    status: billingStatusSchema,
    description: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("BillingConfig");

export const listBillingConfigsQuerySchema = paginationQuerySchema.extend({
  resourceType: z.string().optional(),
});

export const listBillingConfigsResponseSchema = z
  .object({ configs: billingConfigSchema.array(), total: z.number() })
  .openapi("ListBillingConfigsResponse");

export const createBillingConfigBodySchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  billingType: billingTypeSchema,
  priceUnit: z.string().min(1).optional(),
  priceAmount: z.number().nonnegative().optional(),
  status: billingStatusSchema.optional(),
  description: z.string().nullable().optional(),
});

export const updateBillingConfigBodySchema = z.object({
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  billingType: billingTypeSchema.optional(),
  priceUnit: z.string().min(1).optional(),
  priceAmount: z.number().nonnegative().optional(),
  status: billingStatusSchema.optional(),
  description: z.string().nullable().optional(),
});

export const currencyRateSchema = z
  .object({
    id: z.string(),
    currency: z.string(),
    rate: z.number(),
    status: billingStatusSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("CurrencyRate");

export const listCurrencyRatesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().optional(),
});

export const listCurrencyRatesResponseSchema = z
  .object({ rates: currencyRateSchema.array(), total: z.number() })
  .openapi("ListCurrencyRatesResponse");

export const syncCurrencyRatesResponseSchema = z
  .object({
    baseCurrency: z.string(),
    synced: z.number().int(),
    sourceDate: z.string().nullable(),
    syncedAt: z.string(),
  })
  .openapi("SyncCurrencyRatesResponse");
