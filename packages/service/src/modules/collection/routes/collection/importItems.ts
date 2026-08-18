import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { importItems } from "#modules/collection/collection.service";
import { importItemsBodySchema, importItemsResponseSchema } from "./schema";

export const importItemsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "importCollectionItems",
    method: "post",
    path: "/items/import",
    tags: ["Collection"],
    summary: "Import collection items",
    description:
      "Creates collection items from an export file (up to 1000 per request). Items whose source text already exists in the collection are skipped, so re-importing the same file is safe.",
    request: {
      body: {
        content: {
          "application/json": { schema: importItemsBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...okResponseFn(importItemsResponseSchema, "Import result counts"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const body = c.req.valid("json");

    const result = await importItems(getPrincipalUserId(principal), body.items);

    logAudit({
      event: "collection_item.imported",
      category: "collection_item",
      c,
    });

    return c.json(result, 200);
  },
});
