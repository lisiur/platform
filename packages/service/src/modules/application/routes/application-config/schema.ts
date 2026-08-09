import { z } from "@hono/zod-openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const configTypeSchema = z
  .enum(["string", "number", "boolean", "json", "select"])
  .openapi({ example: "string" });

const jsonSchemaValueSchema = z.any().nullable();

export const applicationConfigItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    appId: z.string().openapi({ example: "clxapp123" }),
    group: z.string().openapi({ example: "ai-agent" }),
    key: z.string().openapi({ example: "baseURL" }),
    value: z.string().openapi({ example: "https://api.openai.com/v1" }),
    type: z.string().openapi({
      example: "string",
      description: "Value type: string, number, boolean, json, or select",
    }),
    schema: jsonSchemaValueSchema.nullable().optional(),
    label: z.string().openapi({ example: "Base URL" }),
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
  .openapi("ApplicationConfig");

export const batchUpsertBodySchema = z.object({
  items: z
    .array(
      z.object({
        group: z.string().min(1).openapi({ example: "ai-agent" }),
        key: z.string().min(1).openapi({ example: "baseURL" }),
        value: z.string().openapi({ example: "https://api.openai.com/v1" }),
        type: configTypeSchema.default("string"),
        schema: jsonSchemaValueSchema.optional(),
        label: z.string().optional().openapi({ example: "Base URL" }),
        description: z.string().optional(),
        isSecret: z.boolean().default(false),
        mask: z.string().nullable().optional(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .min(1),
});

export type ApplicationConfigItem = z.infer<typeof applicationConfigItemSchema>;
export type BatchUpsertAppConfigBody = z.infer<typeof batchUpsertBodySchema>;
