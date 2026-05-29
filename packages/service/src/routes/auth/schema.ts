import { z } from "@hono/zod-openapi";

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("AuthError");

export const authUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    banned: z.boolean().nullable().optional(),
    banReason: z.string().nullable().optional(),
    banExpires: z.date().nullable().optional(),
    flags: z.array(z.string()),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AuthUser");

export const authSessionSchema = z
  .object({
    id: z.string(),
    expiresAt: z.date(),
    token: z.string(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    userId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AuthSession");

export const sessionResponseSchema = z
  .object({
    user: authUserSchema.nullable(),
    session: authSessionSchema.nullable(),
  })
  .nullable()
  .openapi("AuthSessionResponse");

export const signInEmailBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const signUpEmailBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
});

export const updateUserBodySchema = z.object({
  name: z.string().min(1).optional(),
  image: z.string().nullable().optional(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const authMutationResponseSchema = z
  .object({
    data: z.unknown().optional(),
    error: z
      .object({
        message: z.string(),
      })
      .nullable()
      .optional(),
  })
  .openapi("AuthMutationResponse");
