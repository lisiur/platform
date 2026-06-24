import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const memberSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    userId: z.string().openapi({ example: "clxuser123" }),
    role: z.string().openapi({ example: "owner" }),
    createdAt: z.date(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      image: z.string().nullable(),
    }),
  })
  .openapi("OrganizationMember");

export const listMembersResponseSchema = z
  .object({
    members: memberSchema.array(),
    total: z.number(),
  })
  .openapi("ListOrganizationMembersResponse");

export const listMembersQuerySchema = paginationQuerySchema;

export const memberParamsSchema = z.object({
  id: z.string().min(1).openapi({ example: "clxorg123" }),
  memberId: z.string().min(1).openapi({ example: "clxmember123" }),
});

export const organizationIdParamSchema = idParamSchema();

export type OrganizationMember = z.infer<typeof memberSchema>;
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;
