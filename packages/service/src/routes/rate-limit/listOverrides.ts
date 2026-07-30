import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listOverrides } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import { rateLimitOverrideItemSchema } from "./schema";

export const listOverridesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listOverrides",
    method: "get",
    path: "/overrides",
    tags: ["RateLimit"],
    summary: "List rate-limit overrides",
    description:
      "Returns all configured override rules (whitelist / custom policy per IP or user).",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        rateLimitOverrideItemSchema.array(),
        "List of rate-limit overrides",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/rate-limit:manage");
    const overrides = await listOverrides();
    return c.json(overrides, 200);
  },
});
