import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const principalTypeSchema = z.enum(["user"]);

export const pricingSubscriptionSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    principalType: z.string().openapi({ example: "user" }),
    principalId: z.string().openapi({ example: "clxUser" }),
    planId: z.string().openapi({ example: "clxPlan" }),
    status: z.string().openapi({ example: "active" }),
    startsAt: z.date(),
    endsAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("PricingSubscription");

export const createPricingSubscriptionBodySchema = z.object({
  principalType: principalTypeSchema,
  principalId: z.string().min(1),
  planId: z.string().min(1),
  status: z.string().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

export const updatePricingSubscriptionBodySchema = z.object({
  status: z.string().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

export const listPricingSubscriptionsQuerySchema = paginationQuerySchema.extend(
  {
    principalType: principalTypeSchema.optional(),
    principalId: z.string().optional(),
    planId: z.string().optional(),
  },
);

export const pricingSubscriptionIdParamSchema = idParamSchema();

export const listPricingSubscriptionsResponseSchema = z
  .object({
    subscriptions: pricingSubscriptionSchema.array(),
    total: z.number(),
  })
  .openapi("ListPricingSubscriptionsResponse");
