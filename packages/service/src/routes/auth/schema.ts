import { z } from "@hono/zod-openapi";
import { passwordSchema } from "#lib/password";

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
    activeOrganizationId: z.string().nullable().optional(),
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
  password: passwordSchema,
});

export const updateUserBodySchema = z.object({
  name: z.string().min(1).optional(),
  image: z.string().nullable().optional(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const signInWechatBodySchema = z.object({
  code: z.string().min(1),
});

export const registrationStatusSchema = z
  .object({
    registrationEnabled: z.boolean(),
  })
  .openapi("RegistrationStatus");

export const signInResponseSchema = z
  .object({
    user: authUserSchema,
    session: authSessionSchema,
  })
  .openapi("SignInResponse");

export const userMutationResponseSchema = z
  .object({
    user: authUserSchema,
  })
  .openapi("UserMutationResponse");
