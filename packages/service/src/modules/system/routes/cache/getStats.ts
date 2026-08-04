import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getCacheStats } from "#modules/system/cache.service";
import { cacheStatsSchema } from "./schema";

export const getStatsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getStats",
    method: "get",
    path: "/stats",
    tags: ["Cache"],
    summary: "View cache statistics",
    description:
      "Returns total key count, max capacity, and per-namespace breakdown.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(cacheStatsSchema, "Current cache statistics"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/cache:view");
    const stats = getCacheStats();
    return c.json(stats, 200);
  },
});
