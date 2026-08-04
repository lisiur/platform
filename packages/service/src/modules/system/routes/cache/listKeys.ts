import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listKeys } from "#modules/system/cache.service";
import { cacheKeyInfoSchema, listKeysQuerySchema } from "./schema";

export const listKeysRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listKeys",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/cache:view");
    const query = c.req.valid("query");
    const keys = listKeys(query.search);
    return c.json(keys, 200);
  },
});
