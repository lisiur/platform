import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteEntry } from "#services/cache.service";
import { assertAccess } from "#services/role-permission.service";
import { entryQuerySchema } from "./schema";

export const deleteEntryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/entry",
    tags: ["Cache"],
    summary: "Delete a cache entry",
    description: "Removes a single entry from the cache by key.",
    request: {
      query: entryQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion result"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "cache::manage");
    const { key } = c.req.valid("query");

    const ok = deleteEntry(key);
    if (!ok) {
      throw new HTTPException(404, { message: "Cache entry not found" });
    }

    await logAudit({
      event: "cache.entry.deleted",
      category: "cache",
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
