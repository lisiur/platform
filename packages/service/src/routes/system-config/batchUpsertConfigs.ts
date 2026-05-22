import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { systemConfigRepository } from "#repositories/system-config.repository";
import {
  batchUpsertBodySchema,
  errorSchema,
  systemConfigItemSchema,
} from "./schema";

export const batchUpsertConfigs = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/batch",
    tags: ["SystemConfig"],
    summary: "Batch upsert configurations",
    description:
      "Create or update multiple system configuration items at once.",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": {
            schema: batchUpsertBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: systemConfigItemSchema.array(),
          },
        },
        description: "The upserted configurations",
      },
      400: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Validation error",
      },
      401: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { items } = c.req.valid("json");

    const configs = await systemConfigRepository.batchUpsert(items);

    return c.json(configs, 200);
  },
});
