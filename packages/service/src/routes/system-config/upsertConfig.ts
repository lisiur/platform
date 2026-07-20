import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { reloadRateLimitDefaultsAndBroadcast } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import { upsertConfig } from "#services/system-config.service";
import {
  systemConfigItemSchema,
  upsertConfigBodySchema,
  upsertConfigParamSchema,
} from "./schema";

export const upsertConfigRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{group}/{key}",
    tags: ["SystemConfig"],
    summary: "Upsert a configuration",
    description: "Create or update a system configuration item.",
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(systemConfigItemSchema, "The upserted configuration"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system-config::upsert");
    const { group, key } = c.req.valid("param");
    const body = c.req.valid("json");

    const config = await upsertConfig(group, key, body);

    if (group === "rate-limit") {
      await reloadRateLimitDefaultsAndBroadcast();
    }

    await logAudit({
      event: "system_config.updated",
      category: "system_config",
      c,
    });

    return c.json(config, 200);
  },
});
