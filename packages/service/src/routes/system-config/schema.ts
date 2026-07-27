import { z } from "@hono/zod-openapi";

// ---- Base schemas ----

export const configTypeSchema = z
  .enum(["string", "number", "boolean", "json", "select"])
  .openapi({ example: "string" });

const jsonSchemaValueSchema = z.any().nullable();

export const systemConfigItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    group: z.string().openapi({ example: "auth" }),
    key: z.string().openapi({ example: "registration.enabled" }),
    value: z.string().openapi({ example: "My Application" }),
    type: z.string().openapi({
      example: "string",
      description: "Value type: string, number, boolean, or json",
    }),
    schema: jsonSchemaValueSchema.nullable().optional(),
    label: z.string().openapi({ example: "Site Name" }),
    description: z.string().nullable().optional(),
    isSecret: z.boolean().openapi({ example: false }),
    mask: z
      .string()
      .nullable()
      .optional()
      .openapi({
        example: "start{4}.{*}end{4}",
        description:
          "Mask template for secret display, e.g. 'start{4}.{*}end{4}'. " +
          "start{N}/end{N} keep N chars; .{N} emits N mask chars; .{*} emits " +
          "one mask char per hidden char. Unknown tokens are ignored.",
      }),
    sortOrder: z.number().openapi({ example: 0 }),
    createdAt: z
      .string()
      .datetime()
      .openapi({ example: "2024-01-01T00:00:00.000Z" }),
    updatedAt: z
      .string()
      .datetime()
      .openapi({ example: "2024-01-01T00:00:00.000Z" }),
  })
  .openapi("SystemConfig");

// ---- Route-specific schemas ----

export const getConfigsQuerySchema = z.object({
  group: z.string().optional().openapi({ example: "auth" }),
});

export const getConfigsByGroupParamSchema = z.object({
  group: z.string().min(1).openapi({ example: "auth" }),
});

export const upsertConfigParamSchema = z.object({
  group: z.string().min(1).openapi({ example: "auth" }),
  key: z.string().min(1).openapi({ example: "registration.enabled" }),
});

export const upsertConfigBodySchema = z.object({
  value: z.string().openapi({ example: "My Application" }),
  type: configTypeSchema.default("string"),
  schema: jsonSchemaValueSchema.optional(),
  label: z.string().min(1).openapi({ example: "Site Name" }),
  description: z.string().optional(),
  isSecret: z.boolean().default(false),
  mask: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const batchUpsertBodySchema = z.object({
  items: z
    .array(
      z.object({
        group: z.string().min(1).openapi({ example: "auth" }),
        key: z.string().min(1).openapi({ example: "registration.enabled" }),
        value: z.string().openapi({ example: "My Application" }),
        type: configTypeSchema.default("string"),
        schema: jsonSchemaValueSchema.optional(),
        label: z.string().min(1).openapi({ example: "Site Name" }),
        description: z.string().optional(),
        isSecret: z.boolean().default(false),
        mask: z.string().nullable().optional(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .min(1),
});

export const deleteConfigParamSchema = z.object({
  group: z.string().min(1).openapi({ example: "auth" }),
  key: z.string().min(1).openapi({ example: "registration.enabled" }),
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
