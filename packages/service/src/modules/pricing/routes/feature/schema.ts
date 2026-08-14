import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const featureSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "platform_assistant" }),
    name: z.string().openapi({ example: "Platform Assistant" }),
    description: z.string().nullable(),
    status: z.string().openapi({ example: "active" }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("Feature");

export const createFeatureBodySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const updateFeatureBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const listFeaturesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const featureIdParamSchema = idParamSchema();

export const listFeaturesResponseSchema = z
  .object({
    features: featureSchema.array(),
    total: z.number(),
  })
  .openapi("ListFeaturesResponse");
