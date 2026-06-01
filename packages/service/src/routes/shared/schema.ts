import { z } from "@hono/zod-openapi";

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");

export const deleteSuccessSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi("DeleteSuccess");

export function idParamSchema(example = "clx1234567890") {
  return z.object({
    id: z.string().min(1).openapi({ example }),
  });
}
