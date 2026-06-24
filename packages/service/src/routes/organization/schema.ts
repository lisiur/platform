import { z } from "@hono/zod-openapi";
import {
  idParamSchema,
  paginationQuerySchema,
  uploadUrlSchema,
} from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const organizationSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Acme Corp" }),
    slug: z.string().openapi({ example: "acme-corp" }),
    logo: z.string().nullable().optional(),
    metadata: z.string().nullable().optional(),
    createdAt: z.date(),
  })
  .openapi("Organization");

export const listOrganizationsQuerySchema = paginationQuerySchema;

export const organizationIdParamSchema = idParamSchema();

export const createOrganizationBodySchema = z.object({
  name: z.string().min(1).openapi({ example: "Acme Corp" }),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .openapi({ example: "acme-corp" }),
  logo: uploadUrlSchema.optional(),
  metadata: z.string().optional(),
});

export const registerOrganizationBodySchema = createOrganizationBodySchema;

export const updateOrganizationBodySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  logo: uploadUrlSchema.nullable().optional(),
  metadata: z.string().nullable().optional(),
});

export const listOrganizationsResponseSchema = z
  .object({
    organizations: organizationSchema.array(),
    total: z.number(),
  })
  .openapi("ListOrganizationsResponse");

export const mineOrganizationsResponseSchema = z
  .object({
    organizations: organizationSchema.array(),
  })
  .openapi("MineOrganizationsResponse");

export type Organization = z.infer<typeof organizationSchema>;
export type CreateOrganizationBody = z.infer<
  typeof createOrganizationBodySchema
>;
export type RegisterOrganizationBody = z.infer<
  typeof registerOrganizationBodySchema
>;
export type ListOrganizationsResponse = z.infer<
  typeof listOrganizationsResponseSchema
>;
export type MineOrganizationsResponse = z.infer<
  typeof mineOrganizationsResponseSchema
>;
export type UpdateOrganizationBody = z.infer<
  typeof updateOrganizationBodySchema
>;
