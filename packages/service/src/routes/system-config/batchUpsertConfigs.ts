import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { reloadAuthDefaults } from "#services/auth-config.service";
import { reloadRateLimitDefaultsAndBroadcast } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import { batchUpsertConfigs } from "#services/system-config.service";
import { batchUpsertBodySchema, systemConfigItemSchema } from "./schema";

export const batchUpsertConfigsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "batchUpsertConfigs",
    method: "put",
    path: "/batch",
    tags: ["SystemConfig"],
    summary: "Batch upsert configurations",
    description:
      "Create or update multiple system configuration items at once.",
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(
        systemConfigItemSchema.array(),
        "The upserted configurations",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/system-config:batchUpsert");
    const { items } = c.req.valid("json");

    const configs = await batchUpsertConfigs(items);

    if (items.some((i: { group: string }) => i.group === "rate-limit")) {
      await reloadRateLimitDefaultsAndBroadcast();
    }
    if (items.some((i: { group: string }) => i.group === "auth")) {
      await reloadAuthDefaults();
    }

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
