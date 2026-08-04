import { z } from "@hono/zod-openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

/** A single operation from the platform OpenAPI spec (for the admin picker). */
export const availableOperationSchema = z
  .object({
    operationId: z.string().openapi({ example: "listJobs" }),
    method: z.string().openapi({ example: "GET" }),
    path: z.string().openapi({ example: "/jobs" }),
    summary: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: "Brief summary of the operation" }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: "Full description" }),
    tags: z
      .string()
      .array()
      .optional()
      .openapi({ description: "Tag categories" }),
  })
  .openapi("AvailableOperation");

/** The app's allowed API operationIds (stored as a JSON-array config row). */
export const allowedApisSchema = z.string().array().openapi("AllowedApis");

/** PUT body: the operationIds the agent may invoke. */
export const allowedApisBodySchema = z
  .object({
    operationIds: z
      .string()
      .array()
      .openapi({ example: ["listJobs"] }),
  })
  .openapi("AllowedApisBody");

export type AvailableOperation = z.infer<typeof availableOperationSchema>;
export type AllowedApisBody = z.infer<typeof allowedApisBodySchema>;
