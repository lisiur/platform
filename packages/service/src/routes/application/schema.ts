import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "../shared/schema";

export { deleteSuccessSchema, errorSchema } from "../shared/schema";

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

export const listApplicationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const applicationIdParamSchema = idParamSchema();

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

export const listApplicationsResponseSchema = z
  .object({
    applications: applicationSchema.array(),
    total: z.number(),
  })
  .openapi("ListApplicationsResponse");

export type Application = z.infer<typeof applicationSchema>;
export type CreateApplicationBody = z.infer<typeof createApplicationBodySchema>;
export type UpdateApplicationBody = z.infer<typeof updateApplicationBodySchema>;
