import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getRateLimitSettings } from "#modules/system/rate-limit.service";
import { rateLimitSettingsSchema } from "./schema";

export const getSettingsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getSettings",
    method: "get",
    path: "/settings",
    tags: ["RateLimit"],
    summary: "View rate-limit limiter settings",
    description:
      "Returns the configured rate limiters (name, max, window) independent of bucket status.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(rateLimitSettingsSchema, "Configured rate limiters"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/rate-limit:manage");
    const settings = getRateLimitSettings();
    return c.json(settings, 200);
  },
});
