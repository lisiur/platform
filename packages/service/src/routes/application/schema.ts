import { z } from "@hono/zod-openapi";
import {
  idParamSchema,
  paginationQuerySchema,
  uploadUrlSchema,
} from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const applicationSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "OA System" }),
    code: z.string().openapi({ example: "oa" }),
    description: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    copyright: z.string().nullable().optional(),
    icp: z.string().nullable().optional(),
    psif: z.string().nullable().optional(),
    watermarkEnabled: z.boolean().openapi({ example: false }),
    watermarkConfig: z.string().nullable().optional(),
    sortOrder: z.number().openapi({ example: 0 }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("Application");

export const currentApplicationSchema = applicationSchema
  .pick({
    name: true,
    code: true,
    description: true,
    logo: true,
    favicon: true,
    copyright: true,
    icp: true,
    psif: true,
    watermarkEnabled: true,
    watermarkConfig: true,
  })
  .openapi("CurrentApplication");

export const listApplicationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const applicationIdParamSchema = idParamSchema();

export const createApplicationBodySchema = z.object({
  name: z.string().min(1).openapi({ example: "OA System" }),
  code: z.string().min(1).openapi({ example: "oa" }),
  description: z.string().optional(),
  logo: uploadUrlSchema.optional(),
  favicon: uploadUrlSchema.optional(),
  copyright: z.string().optional(),
  icp: z.string().optional(),
  psif: z.string().optional(),
  watermarkEnabled: z.boolean().optional(),
  watermarkConfig: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateApplicationBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  logo: uploadUrlSchema.nullable().optional(),
  favicon: uploadUrlSchema.nullable().optional(),
  copyright: z.string().nullable().optional(),
  icp: z.string().nullable().optional(),
  psif: z.string().nullable().optional(),
  watermarkEnabled: z.boolean().optional(),
  watermarkConfig: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const listApplicationsResponseSchema = z
  .object({
    applications: applicationSchema.array(),
    total: z.number(),
  })
  .openapi("ListApplicationsResponse");

export type Application = z.infer<typeof applicationSchema>;
export type CurrentApplication = z.infer<typeof currentApplicationSchema>;
export type CreateApplicationBody = z.infer<typeof createApplicationBodySchema>;
export type UpdateApplicationBody = z.infer<typeof updateApplicationBodySchema>;
