import { z } from "@hono/zod-openapi";
import { paginationQuerySchema } from "#lib/openapi";

export { errorSchema } from "#lib/openapi";

export const memberSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    role: z.string(),
    departmentId: z.string().nullable(),
    department: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .nullable(),
    createdAt: z.date(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      image: z.string().nullable(),
    }),
  })
  .openapi("Member");

export const memberIdParamSchema = z.object({
  memberId: z.string(),
});

export const orgIdParamSchema = z.object({
  id: z.string(),
});

export const listMembersQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().nullable().optional(),
});

export const updateMemberBodySchema = z.object({
  departmentId: z.string().nullable(),
});

export const listMembersResponseSchema = z
  .object({
    members: memberSchema.array(),
    total: z.number(),
  })
  .openapi("ListMembersResponse");

export type Member = z.infer<typeof memberSchema>;
