import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { batchUpsertConfigs } from "#services/system-config.service";
import {
  batchUpsertBodySchema,
  errorSchema,
  systemConfigItemSchema,
} from "./schema";

export const batchUpsertConfigsRoute = defineOpenAPIRoute({
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

    const configs = await batchUpsertConfigs(items);

    await logAudit({
      event: "system_config.batch_updated",
      category: "system_config",
      metadata: {
        keys: items.map(
          (i: { group: string; key: string }) => `${i.group}.${i.key}`,
        ),
      },
      c,
    });

    return c.json(configs, 200);
  },
});
