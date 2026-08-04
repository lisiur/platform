import { z } from "@hono/zod-openapi";

export const overrideSubjectSchema = z
  .string()
  .min(1)
  .openapi({ example: "ip:1.2.3.4" });

export const overrideTypeSchema = z.enum(["ip", "user"]);

export const rateLimitOverrideItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    subject: z.string().openapi({ example: "ip:1.2.3.4" }),
    type: overrideTypeSchema.openapi({ example: "ip" }),
    max: z.number().int().nullable().openapi({ example: 100 }),
    windowMs: z.number().int().nullable().openapi({ example: 60000 }),
    bypass: z.boolean().openapi({ example: false }),
    note: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: "Trusted office IP" }),
    startAt: z.string().datetime().nullable().openapi({
      example: "2026-07-08T00:00:00.000Z",
    }),
    endAt: z.string().datetime().nullable().openapi({
      example: "2026-07-09T00:00:00.000Z",
    }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("RateLimitOverride");

export const upsertOverrideParamSchema = z.object({
  subject: overrideSubjectSchema,
});

export const upsertOverrideBodySchema = z.object({
  type: overrideTypeSchema.default("ip"),
  max: z.number().int().positive().nullable().optional(),
  windowMs: z.number().int().positive().nullable().optional(),
  bypass: z.boolean().default(false),
  note: z.string().nullable().optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
});

export const statusQuerySchema = z.object({
  limiter: z.string().optional().openapi({ example: "auth" }),
  blocked: z.coerce.boolean().optional().openapi({ example: true }),
});

export const bucketStatusSchema = z
  .object({
    limiter: z.string().openapi({ example: "auth" }),
    subject: z.string().openapi({ example: "ip:1.2.3.4" }),
    count: z.number().int().openapi({ example: 11 }),
    max: z.number().int().nullable().openapi({ example: 10 }),
    remaining: z.number().int().nullable().openapi({ example: 0 }),
    bypass: z.boolean().openapi({ example: false }),
    blocked: z.boolean().openapi({ example: true }),
    resetAt: z
      .string()
      .datetime()
      .openapi({ example: "2026-07-08T12:00:01.000Z" }),
  })
  .openapi("RateLimitBucketStatus");

export const rateLimitStatusSchema = z
  .object({
    blockedCount: z.number().int().openapi({ example: 2 }),
    buckets: z.array(bucketStatusSchema),
  })
  .openapi("RateLimitStatus");

export const rateLimitSettingsSchema = z
  .array(
    z
      .object({
        name: z.string().openapi({ example: "auth" }),
        max: z.number().int().openapi({ example: 10 }),
        windowMs: z.number().int().openapi({ example: 60000 }),
      })
      .openapi("RateLimitLimiterConfig"),
  )
  .openapi("RateLimitSettings");

export const releaseBodySchema = z.object({
  limiter: z.string().optional().openapi({ example: "auth" }),
  subject: overrideSubjectSchema,
});

export const releaseResultSchema = z
  .object({
    released: z.array(z.string()).openapi({ example: ["auth", "global"] }),
    subject: z.string().openapi({ example: "ip:1.2.3.4" }),
  })
  .openapi("RateLimitReleaseResult");
