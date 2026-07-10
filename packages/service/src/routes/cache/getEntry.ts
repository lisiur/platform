import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getEntry } from "#services/cache.service";
import { assertPermission } from "#services/role-permission.service";
import { cacheEntrySchema, entryQuerySchema } from "./schema";

export const getEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/entry",
    tags: ["Cache"],
    summary: "Get a cache entry",
    description: "Returns the full value of a single cache entry by key.",
    request: {
      query: entryQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(cacheEntrySchema, "Cache entry value"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "cache::view");
    const { key } = c.req.valid("query");
    const entry = getEntry(key);
    if (!entry) {
      throw new HTTPException(404, { message: "Cache entry not found" });
    }
    return c.json(entry, 200);
  },
});
