import { z } from "@hono/zod-openapi";
import { idParamSchema } from "#lib/openapi";

export { errorSchema } from "#lib/openapi";

export const apiTokenSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    tokenPrefix: z.string().openapi({ example: "tk-ab1" }),
    tokenSuffix: z.string().openapi({ example: "wXyZ" }),
    name: z.string().openapi({ example: "Production server" }),
    ownerId: z.string().openapi({ example: "clx1234567890" }),
    scopes: z.array(z.string()).openapi({ example: ["system/member:read"] }),
    scope: z.string().nullable().optional(),
    enabled: z.boolean().openapi({ example: true }),
    expiresAt: z.date().nullable().optional(),
    lastUsedAt: z.date().nullable().optional(),
    lastUsedIp: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("ApiToken");

export const createApiTokenBodySchema = z.object({
  name: z.string().min(1).openapi({ example: "Production server" }),
  scopes: z
    .array(z.string().min(1))
    .openapi({ example: ["system/member:read", "system/department:read"] }),
  scope: z.string().optional(),
  expiresAt: z.string().datetime().optional().openapi({
    example: "2026-08-01T00:00:00.000Z",
    description: "ISO 8601 expiry date. Omit for a token that never expires.",
  }),
});

export const createApiTokenResponseSchema = z
  .object({
    token: z.string().openapi({
      example: "plat_aBcDeFgH...",
      description: "Full token string. Shown only once at creation.",
    }),
    record: apiTokenSchema,
  })
  .openapi("CreateApiTokenResponse");

export const updateApiTokenBodySchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  scopes: z.array(z.string().min(1)).optional(),
});

export const listApiTokensResponseSchema = z
  .object({
    tokens: apiTokenSchema.array(),
  })
  .openapi("ListApiTokensResponse");

export const availableScopeSchema = z.object({
  id: z.string(),
  code: z.string().openapi({ example: "system/member:read" }),
  name: z.string().openapi({ example: "List Members" }),
  group: z.string().openapi({ example: "member" }),
  description: z.string().nullable().optional(),
});

export const listAvailableScopesResponseSchema = z
  .object({
    scopes: availableScopeSchema.array(),
  })
  .openapi("ListAvailableScopesResponse");

export const apiTokenIdParamSchema = idParamSchema();
