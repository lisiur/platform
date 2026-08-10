import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getItem, updateItem } from "#modules/collection/collection.service";
import {
  collectionItemDetailSchema,
  itemIdParamSchema,
  serializeItemDetail,
  updateItemBodySchema,
} from "./schema";

export const updateItemRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateCollectionItem",
    method: "patch",
    path: "/items/{id}",
    tags: ["Collection"],
    summary: "Update a collection item",
    description:
      "Updates editable fields (title, note, tags, status, mastery, url) of a collection item.",
    request: {
      params: itemIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateItemBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...okResponseFn(
        collectionItemDetailSchema,
        "The updated collection item",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const ownerId = getPrincipalUserId(principal);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    await updateItem(ownerId, id, body);

    logAudit({
      event: "collection_item.updated",
      category: "collection_item",
      c,
    });

    return c.json(serializeItemDetail(await getItem(ownerId, id)), 200);
  },
});
