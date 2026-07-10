import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { setEntry } from "#services/cache.service";
import { assertPermission } from "#services/role-permission.service";
import { cacheEntrySchema, updateEntryBodySchema } from "./schema";

export const updateEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/entry",
    tags: ["Cache"],
    summary: "Update a cache entry",
    description: "Sets or overwrites the value of a cache entry by key.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: updateEntryBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(cacheEntrySchema, "Updated cache entry"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "cache::manage");
    const body = c.req.valid("json");

    const entry = setEntry(body.key, body.value);

    await logAudit({
      event: "cache.entry.updated",
      category: "cache",
      targetType: "cache_entry",
      targetName: body.key,
      c,
    });

    return c.json(entry, 200);
  },
});
