import { z } from "@hono/zod-openapi";
import { passwordSchema } from "#lib/password";

export { errorSchema, successSchema } from "#lib/openapi";

export const adminUserSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "John Doe" }),
    email: z.string().openapi({ example: "john@example.com" }),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    banned: z.boolean().nullable().optional(),
    flags: z.array(z.string()).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    userRoles: z
      .array(
        z.object({
          id: z.string(),
          roleId: z.string(),
          role: z.object({
            id: z.string(),
            appId: z.string(),
            name: z.string(),
            code: z.string(),
          }),
        }),
      )
      .optional(),
  })
  .openapi("AdminUser");

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
});

export const listUsersResponseSchema = z
  .object({
    users: adminUserSchema.array(),
    total: z.number(),
  })
  .openapi("ListUsersResponse");

export const createUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: passwordSchema,
  roleIds: z.array(z.string()).default([]),
});

export const updateUserBodySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  roleIds: z.array(z.string()).optional(),
});

export const resetPasswordBodySchema = z.object({
  password: passwordSchema,
});

export const userIdParamSchema = z.object({
  id: z.string().min(1),
});
