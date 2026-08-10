import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  notFoundResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { enrichItem } from "#modules/collection/enrich.service";
import {
  enrichBodySchema,
  enrichResponseSchema,
  itemIdParamSchema,
} from "./schema";

export const enrichItemRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "enrichCollectionItem",
    method: "post",
    path: "/items/{id}/enrich",
    tags: ["Collection"],
    summary: "Generate or refresh AI enrichments",
    description:
      "Generates (or regenerates) AI enrichments for a collection item using the StudyBuddy app's AI configuration. Omit `kinds` to generate all enrichments applicable to the item's type.",
    request: {
      params: itemIdParamSchema,
      body: {
        content: {
          "application/json": { schema: enrichBodySchema },
        },
        required: false,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(enrichResponseSchema, "The generated enrichment kinds"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await enrichItem(
      getPrincipalUserId(principal),
      id,
      body?.kinds,
    );

    logAudit({
      event: "collection_item.enriched",
      category: "collection_item",
      c,
    });

    return c.json(result, 200);
  },
});
