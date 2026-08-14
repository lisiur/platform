import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

const planFeatureSchema = z.object({
  featureId: z.string().openapi({ example: "clxFeatureId" }),
  code: z.string().openapi({ example: "platform_assistant" }),
  name: z.string().openapi({ example: "Platform Assistant" }),
});

export const pricingPlanSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "unlimited" }),
    name: z.string().openapi({ example: "Unlimited" }),
    price: z.number().openapi({ example: 0 }),
    currency: z.string().openapi({ example: "USD" }),
    status: z.string().openapi({ example: "active" }),
    features: planFeatureSchema.array(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("PricingPlan");

const featureInputSchema = z.object({
  featureId: z.string().min(1),
});

export const createPricingPlanBodySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  features: featureInputSchema.array().optional(),
});

export const updatePricingPlanBodySchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  features: featureInputSchema.array().optional(),
});

export const listPricingPlansQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const pricingPlanIdParamSchema = idParamSchema();

export const listPricingPlansResponseSchema = z
  .object({
    plans: pricingPlanSchema.array(),
    total: z.number(),
  })
  .openapi("ListPricingPlansResponse");
