import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { retryItemEnrichment } from "#modules/collection/collection.service";
import { itemIdParamSchema, retryEnrichResponseSchema } from "./schema";

export const retryEnrichItemRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "retryCollectionItemEnrichment",
    method: "post",
    path: "/items/{id}/enrich/retry",
    tags: ["Collection"],
    summary: "Retry failed auto-enrichment",
    description:
      "Resets a failed auto-enrichment back to pending and re-runs it in the background. Returns immediately; poll the item while `enrichStatus` is `pending`.",
    request: {
      params: itemIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...conflictResponse,
      ...okResponseFn(
        retryEnrichResponseSchema,
        "The item's enrichment status (pending)",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    const result = await retryItemEnrichment(getPrincipalUserId(principal), id);

    logAudit({
      event: "collection_item.enrichment_retried",
      category: "collection_item",
      c,
    });

    return c.json(result, 200);
  },
});
