import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { createItem } from "#modules/collection/collection.service";
import {
  createItemBodySchema,
  createItemResponseSchema,
  serializeItemDetail,
} from "./schema";

export const createItemRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createCollectionItem",
    method: "post",
    path: "/items",
    tags: ["Collection"],
    summary: "Create a collection item",
    description:
      "Captures an English word, phrase, sentence, article, or link into the current user's personal collection. Accepts session or Bearer-token (API token) auth, so external clients (browser extensions, share-sheets) can capture via a personal API token. When an item with the same source text already exists for the user, no duplicate is created: the stored item is reset to active (learning) so it reappears in the study deck immediately, and the response carries alreadyExists=true.",
    request: {
      body: {
        content: {
          "application/json": { schema: createItemBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...createdResponseFn(
        createItemResponseSchema,
        "The created (or deduplicated) collection item",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const body = c.req.valid("json");

    const item = await createItem({
      ownerId: getPrincipalUserId(principal),
      type: body.type,
      source: body.source,
      url: body.url ?? null,
      title: body.title ?? null,
      note: body.note ?? null,
      tags: body.tags ?? [],
    });

    logAudit({
      event: "collection_item.created",
      category: "collection_item",
      c,
    });

    return c.json(
      { ...serializeItemDetail(item), alreadyExists: item.alreadyExists },
      201,
    );
  },
});
