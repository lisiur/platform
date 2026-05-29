import { z } from "@hono/zod-openapi";

// ---- Base schemas ----

export const configTypeSchema = z
  .enum(["string", "number", "boolean", "json"])
  .openapi({ example: "string" });

export const systemConfigItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    group: z.string().openapi({ example: "general" }),
    key: z.string().openapi({ example: "site.name" }),
    value: z.string().openapi({ example: "My Application" }),
    type: z.string().openapi({
      example: "string",
      description: "Value type: string, number, boolean, or json",
    }),
    label: z.string().openapi({ example: "Site Name" }),
    description: z.string().nullable().optional(),
    isSecret: z.boolean().openapi({ example: false }),
    sortOrder: z.number().openapi({ example: 0 }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("SystemConfig");

// ---- Route-specific schemas ----

export const getConfigsQuerySchema = z.object({
  group: z.string().optional().openapi({ example: "general" }),
});

export const getConfigsByGroupParamSchema = z.object({
  group: z.string().min(1).openapi({ example: "general" }),
});

export const upsertConfigParamSchema = z.object({
  group: z.string().min(1).openapi({ example: "general" }),
  key: z.string().min(1).openapi({ example: "site.name" }),
});

export const upsertConfigBodySchema = z.object({
  value: z.string().openapi({ example: "My Application" }),
  type: configTypeSchema.default("string"),
  label: z.string().min(1).openapi({ example: "Site Name" }),
  description: z.string().optional(),
  isSecret: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const batchUpsertBodySchema = z.object({
  items: z
    .array(
      z.object({
        group: z.string().min(1).openapi({ example: "general" }),
        key: z.string().min(1).openapi({ example: "site.name" }),
        value: z.string().openapi({ example: "My Application" }),
        type: configTypeSchema.default("string"),
        label: z.string().min(1).openapi({ example: "Site Name" }),
        description: z.string().optional(),
        isSecret: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
      }),
    )
    .min(1),
});

export const deleteConfigParamSchema = z.object({
  group: z.string().min(1).openapi({ example: "general" }),
  key: z.string().min(1).openapi({ example: "site.name" }),
});

// ---- Response schemas ----

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("SystemConfigError");

export const deleteSuccessSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi("SystemConfigDeleteSuccess");

// ---- Types ----

export type SystemConfigItem = z.infer<typeof systemConfigItemSchema>;
export type UpsertConfigBody = z.infer<typeof upsertConfigBodySchema>;
export type BatchUpsertBody = z.infer<typeof batchUpsertBodySchema>;
