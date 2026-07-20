import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { upsertOverride } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import {
  rateLimitOverrideItemSchema,
  upsertOverrideBodySchema,
  upsertOverrideParamSchema,
} from "./schema";

export const upsertOverrideRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/overrides/{subject}",
    tags: ["RateLimit"],
    summary: "Upsert a rate-limit override",
    description:
      "Create or update an override rule for a specific IP or user. Supports a custom max/window, full bypass (whitelist), and an optional active time range.",
    request: {
      params: upsertOverrideParamSchema,
      body: {
        content: {
          "application/json": {
            schema: upsertOverrideBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(rateLimitOverrideItemSchema, "The upserted override"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "rate-limit::manage");
    const { subject } = c.req.valid("param");
    const body = c.req.valid("json");

    const override = await upsertOverride(subject, body);

    await logAudit({
      event: "rate_limit.override.upserted",
      category: "rate_limit",
      after: override,
      c,
    });

    return c.json(override, 200);
  },
});
