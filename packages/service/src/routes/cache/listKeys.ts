import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listKeys } from "#services/cache.service";
import { assertPermission } from "#services/role-permission.service";
import { cacheKeyInfoSchema, listKeysQuerySchema } from "./schema";

export const listKeysRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/keys",
    tags: ["Cache"],
    summary: "List cache keys",
    description:
      "Returns all cache keys with namespace, key name, and detected value type. Optional fuzzy search.",
    request: {
      query: listKeysQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(z.array(cacheKeyInfoSchema), "List of cache keys"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "cache::view");
    const query = c.req.valid("query");
    const keys = listKeys(query.search);
    return c.json(keys, 200);
  },
});
