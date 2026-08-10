import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteItem } from "#modules/collection/collection.service";
import { itemIdParamSchema } from "./schema";

export const deleteItemRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteCollectionItem",
    method: "delete",
    path: "/items/{id}",
    tags: ["Collection"],
    summary: "Delete a collection item",
    description:
      "Deletes a collection item along with its enrichments and attachments.",
    request: {
      params: itemIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...notFoundResponse,
      200: {
        content: { "application/json": { schema: deleteSuccessSchema } },
        description: "Collection item deleted",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    await deleteItem(getPrincipalUserId(principal), id);

    logAudit({
      event: "collection_item.deleted",
      category: "collection_item",
      c,
    });

    return c.json({ success: true } as const, 200);
  },
});
