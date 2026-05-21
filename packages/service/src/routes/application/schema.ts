import { z } from "@hono/zod-openapi";

export const applicationSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "OA System" }),
    code: z.string().openapi({ example: "oa" }),
    description: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    sortOrder: z.number().openapi({ example: 0 }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("Application");

export const listApplicationsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const applicationIdParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const createApplicationBodySchema = z.object({
  name: z.string().min(1).openapi({ example: "OA System" }),
  code: z.string().min(1).openapi({ example: "oa" }),
  description: z.string().optional(),
  logo: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateApplicationBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");

export const deleteSuccessSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi("DeleteSuccess");

export const listApplicationsResponseSchema = z
  .object({
    applications: applicationSchema.array(),
    total: z.number(),
  })
  .openapi("ListApplicationsResponse");

export type Application = z.infer<typeof applicationSchema>;
export type CreateApplicationBody = z.infer<typeof createApplicationBodySchema>;
export type UpdateApplicationBody = z.infer<typeof updateApplicationBodySchema>;
