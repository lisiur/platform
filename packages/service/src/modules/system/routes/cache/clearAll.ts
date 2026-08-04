import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { clearAll } from "#modules/system/cache.service";
import { clearResultSchema } from "./schema";

export const clearAllRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "clearAll",
    method: "delete",
    path: "/all",
    tags: ["Cache"],
    summary: "Clear all cache",
    description: "Removes every entry from the in-memory cache.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(clearResultSchema, "Number of entries cleared"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/cache:manage");

    const cleared = clearAll();

    await logAudit({
      event: "cache.all_cleared",
      category: "cache",
      metadata: { cleared },
      c,
    });

    return c.json({ cleared }, 200);
  },
});
