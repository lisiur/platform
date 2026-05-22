import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { systemConfigRepository } from "#repositories/system-config.repository";
import {
  errorSchema,
  systemConfigItemSchema,
  upsertConfigBodySchema,
  upsertConfigParamSchema,
} from "./schema";

export const upsertConfig = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{group}/{key}",
    tags: ["SystemConfig"],
    summary: "Upsert a configuration",
    description: "Create or update a system configuration item.",
    middleware: requireAdmin,
    request: {
      params: upsertConfigParamSchema,
      body: {
        content: {
          "application/json": {
            schema: upsertConfigBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: systemConfigItemSchema,
          },
        },
        description: "The upserted configuration",
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
    const { group, key } = c.req.valid("param");
    const body = c.req.valid("json");

    const config = await systemConfigRepository.upsert(group, key, body);
    return c.json(config, 200);
  },
});
