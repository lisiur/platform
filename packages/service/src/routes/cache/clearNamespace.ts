import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { clearNamespace } from "#services/cache.service";
import { assertPermission } from "#services/role-permission.service";
import { clearNamespaceBodySchema, clearResultSchema } from "./schema";

export const clearNamespaceRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/namespace",
    tags: ["Cache"],
    summary: "Clear a cache namespace",
    description:
      "Removes all entries whose key starts with the given namespace prefix.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: clearNamespaceBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(clearResultSchema, "Number of entries cleared"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "cache::manage");
    const body = c.req.valid("json");

    const cleared = clearNamespace(body.namespace);

    await logAudit({
      event: "cache.namespace.cleared",
      category: "cache",
      targetType: "cache_namespace",
      targetName: body.namespace,
      metadata: { cleared },
      c,
    });

    return c.json({ cleared }, 200);
  },
});
