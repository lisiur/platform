import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { exportItems } from "#modules/collection/collection.service";
import { exportItemsResponseSchema } from "./schema";

export const exportItemsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "exportCollectionItems",
    method: "get",
    path: "/items/export",
    tags: ["Collection"],
    summary: "Export all collection items",
    description:
      "Returns the current user's entire collection (items with their AI enrichments) as a portable JSON document suitable for backup or migration.",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(exportItemsResponseSchema, "The exported collection"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const payload = await exportItems(getPrincipalUserId(principal));

    logAudit({
      event: "collection_item.exported",
      category: "collection_item",
      c,
    });

    return c.json(payload, 200, {
      "content-disposition": `attachment; filename="studybuddy-collection.json"`,
    });
  },
});
