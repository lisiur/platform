import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getCacheStats } from "#services/cache.service";
import { assertPermission } from "#services/role-permission.service";
import { cacheStatsSchema } from "./schema";

export const getStatsRoute = defineOpenAPIRoute({
  route: createRoute({
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
    const session = await requireSession(c);
    await assertPermission(session.user.id, "cache::view");
    const stats = getCacheStats();
    return c.json(stats, 200);
  },
});
