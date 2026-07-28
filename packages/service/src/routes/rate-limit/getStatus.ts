import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getRateLimitStatus } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import { rateLimitStatusSchema, statusQuerySchema } from "./schema";

export const getStatusRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/status",
    tags: ["RateLimit"],
    summary: "View rate-limit status",
    description:
      "Returns active rate-limit buckets (per IP/user), which are currently blocked, and configured limiters.",
    request: {
      query: statusQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(rateLimitStatusSchema, "Current rate-limit status"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/rate-limit:manage");
    const query = c.req.valid("query");
    const status = getRateLimitStatus({
      limiter: query.limiter,
      blockedOnly: query.blocked,
    });
    return c.json(status, 200);
  },
});
