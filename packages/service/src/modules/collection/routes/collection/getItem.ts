import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getItem } from "#modules/collection/collection.service";
import {
  collectionItemDetailSchema,
  itemIdParamSchema,
  serializeItemDetail,
} from "./schema";

export const getItemRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getCollectionItem",
    method: "get",
    path: "/items/{id}",
    tags: ["Collection"],
    summary: "Get a collection item",
    description:
      "Returns a single collection item with all of its AI enrichments.",
    request: {
      params: itemIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...notFoundResponse,
      ...okResponseFn(collectionItemDetailSchema, "The collection item"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    const item = await getItem(getPrincipalUserId(principal), id);
    return c.json(serializeItemDetail(item), 200);
  },
});
