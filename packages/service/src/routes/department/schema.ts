import { z } from "@hono/zod-openapi";
import { idParamSchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const departmentSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    organizationId: z.string(),
    parentId: z.string().nullable(),
    name: z.string().openapi({ example: "Engineering" }),
    code: z.string().openapi({ example: "engineering" }),
    description: z.string().nullable().optional(),
    sortOrder: z.number(),
    createdAt: z.date(),
  })
  .openapi("Department");

export const departmentIdParamSchema = idParamSchema();

export const orgIdParamSchema = z.object({
  orgId: z.string(),
});

export const createDepartmentBodySchema = z.object({
  name: z.string().min(1).openapi({ example: "Engineering" }),
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .openapi({ example: "engineering" }),
  parentId: z.string().nullable().optional(),
  description: z.string().optional(),
});

export const updateDepartmentBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  parentId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const listDepartmentsResponseSchema = z
  .object({
    departments: departmentSchema.array(),
  })
  .openapi("ListDepartmentsResponse");

export type Department = z.infer<typeof departmentSchema>;
export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBodySchema>;
