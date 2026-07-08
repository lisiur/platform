import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { reloadRateLimitDefaults } from "#services/rate-limit.service";
import { assertPermission } from "#services/role-permission.service";
import { batchUpsertConfigs } from "#services/system-config.service";
import { eventBus } from "#states/event-bus";
import { batchUpsertBodySchema, systemConfigItemSchema } from "./schema";

export const batchUpsertConfigsRoute = defineOpenAPIRoute({
  route: createRoute({
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
    const session = await requireSession(c);
    await assertPermission(session.user.id, "system-config::batchUpsert");
    const { items } = c.req.valid("json");

    const configs = await batchUpsertConfigs(items);

    if (items.some((i: { group: string }) => i.group === "rate-limit")) {
      await reloadRateLimitDefaults();
      eventBus.broadcast({ type: "rate_limit.updated", appId: "admin" });
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
