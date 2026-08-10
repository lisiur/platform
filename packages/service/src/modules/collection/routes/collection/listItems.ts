import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listItems } from "#modules/collection/collection.service";
import { listItemsQuerySchema, listItemsResponseSchema } from "./schema";

export const listItemsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listCollectionItems",
    method: "get",
    path: "/items",
    tags: ["Collection"],
    summary: "List collection items",
    description:
      "Returns the current user's collection items with optional type/tag/search/status filters.",
    request: {
      query: listItemsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(listItemsResponseSchema, "List of collection items"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const query = c.req.valid("query");

    const result = await listItems(getPrincipalUserId(principal), {
      type: query.type,
      tag: query.tag,
      q: query.q,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(
      {
        items: result.items.map((item) => ({
          ...item,
          enrichmentsCount: item._count.enrichments,
        })),
        total: result.total,
      },
      200,
    );
  },
});
