import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { clearAll } from "#services/cache.service";
import { assertPermission } from "#services/role-permission.service";
import { clearResultSchema } from "./schema";

export const clearAllRoute = defineOpenAPIRoute({
  route: createRoute({
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
    const session = await requireSession(c);
    await assertPermission(session.user.id, "cache::manage");

    const cleared = clearAll();

    await logAudit({
      event: "cache.all_cleared",
      category: "cache",
      targetType: "cache",
      targetName: "global",
      metadata: { cleared },
      c,
    });

    return c.json({ cleared }, 200);
  },
});
