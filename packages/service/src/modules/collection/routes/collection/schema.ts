import { z } from "@hono/zod-openapi";
import type { CollectionItemType } from "#generated/prisma/client";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const collectionItemTypeSchema = z.enum([
  "WORD",
  "PHRASE",
  "SENTENCE",
  "ARTICLE",
  "LINK",
]);

export const itemEnrichmentSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    kind: z.string().openapi({ example: "translation" }),
    content: z.record(z.string(), z.any()).openapi({
      example: { translation: "短暂的", pronunciation: "/ɪˈfemərəl/" },
    }),
    model: z.string().openapi({ example: "gpt-4o-mini" }),
    generatedAt: z.date(),
  })
  .openapi("ItemEnrichment");

export const ENRICH_STATUSES = ["none", "pending", "ok", "failed"] as const;
export type EnrichStatus = (typeof ENRICH_STATUSES)[number];

const itemCommon = {
  id: z.string().openapi({ example: "clx1234567890" }),
  ownerId: z.string().openapi({ example: "clx1234567890" }),
  appId: z.string().openapi({ example: "studybuddy" }),
  type: collectionItemTypeSchema,
  source: z.string().openapi({ example: "ephemeral" }),
  url: z.string().url().nullable().openapi({ example: null }),
  title: z.string().nullable().openapi({ example: "Ephemeral" }),
  note: z.string().nullable().openapi({ example: null }),
  tags: z.array(z.string()).openapi({ example: ["adjective"] }),
  status: z.string().openapi({ example: "active" }),
  mastery: z.number().int().openapi({ example: 0 }),
  enrichStatus: z.enum(ENRICH_STATUSES).openapi({
    example: "ok",
    description: "Auto-enrichment lifecycle status",
  }),
  enrichError: z.string().nullable().openapi({
    example: null,
    description: "Error message when enrichStatus is failed",
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
};

export const collectionItemSchema = z
  .object({
    ...itemCommon,
    enrichmentsCount: z.number().int().openapi({ example: 2 }),
  })
  .openapi("CollectionItem");

export const itemAttachmentSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    url: z.string().openapi({ example: "/api/attachment/clx1234567890" }),
  })
  .openapi("ItemAttachment");

export const collectionItemDetailSchema = z
  .object({
    ...itemCommon,
    enrichments: itemEnrichmentSchema.array(),
    attachments: itemAttachmentSchema.array(),
  })
  .openapi("CollectionItemDetail");

export const itemIdParamSchema = idParamSchema();

export const retryEnrichResponseSchema = z
  .object({
    itemId: z.string().openapi({ example: "clx1234567890" }),
    enrichStatus: z.enum(ENRICH_STATUSES),
  })
  .openapi("RetryEnrichItemResponse");

export const createItemBodySchema = z
  .object({
    type: collectionItemTypeSchema,
    source: z.string().min(1).openapi({ example: "ephemeral" }),
    url: z.string().url().optional(),
    title: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .refine((val) => val.type !== "LINK" || /^https?:\/\/.+/i.test(val.source), {
    message: "source must be an http(s) URL for LINK type",
  });

export const updateItemBodySchema = z.object({
  title: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  tags: z.array(z.string().min(1)).optional(),
  status: z.enum(["active", "archived", "learned"]).optional(),
  mastery: z.number().int().min(0).max(5).optional(),
  url: z.string().url().nullable().optional(),
});

export const listItemsQuerySchema = paginationQuerySchema
  .extend({
    type: collectionItemTypeSchema.optional(),
    tag: z.string().optional(),
    q: z.string().optional(),
    status: z.enum(["active", "archived", "learned"]).optional(),
  })
  .openapi("ListCollectionItemsQuery");

export const listItemsResponseSchema = z
  .object({
    items: collectionItemSchema.array(),
    total: z.number().int(),
  })
  .openapi("ListCollectionItemsResponse");

export const enrichBodySchema = z.object({
  kinds: z
    .array(
      z.enum([
        "translation",
        "etymology",
        "examples",
        "synonyms",
        "grammar",
        "summary",
      ]),
    )
    .optional()
    .openapi({ example: ["translation", "examples"] }),
});

export const enrichResponseSchema = z
  .object({
    itemId: z.string().openapi({ example: "clx1234567890" }),
    generated: z
      .array(z.string())
      .openapi({ example: ["translation", "examples"] }),
  })
  .openapi("EnrichItemResponse");

const exportedEnrichmentSchema = z.object({
  kind: z.string().openapi({ example: "translation" }),
  content: z.record(z.string(), z.any()).openapi({
    example: { translation: "短暂的", pronunciation: "/ɪˈfemərəl/" },
  }),
  model: z.string().openapi({ example: "gpt-4o-mini" }),
  generatedAt: z.coerce.date().openapi({ example: "2025-01-01T00:00:00Z" }),
});

export const exportedItemSchema = z
  .object({
    type: collectionItemTypeSchema,
    source: z.string().min(1).openapi({ example: "ephemeral" }),
    url: z.url().nullable().optional().openapi({ example: null }),
    title: z.string().nullable().optional().openapi({ example: "Ephemeral" }),
    note: z.string().nullable().optional().openapi({ example: null }),
    tags: z.array(z.string().min(1)).openapi({ example: ["adjective"] }),
    status: z.enum(["active", "archived", "learned"]).optional(),
    mastery: z.number().int().min(0).max(5).optional(),
    enrichStatus: z.enum(ENRICH_STATUSES).optional(),
    createdAt: z.coerce.date().optional(),
    enrichments: exportedEnrichmentSchema.array().max(20),
  })
  .refine((val) => val.type !== "LINK" || /^https?:\/\/.+/i.test(val.source), {
    message: "source must be an http(s) URL for LINK type",
  })
  .openapi("ExportedCollectionItem");

export const exportItemsResponseSchema = z
  .object({
    version: z.number().int().openapi({ example: 1 }),
    exportedAt: z.date(),
    items: exportedItemSchema.array(),
  })
  .openapi("ExportCollectionResponse");

export const importItemsBodySchema = z
  .object({
    items: exportedItemSchema.array().min(1).max(1000),
  })
  .openapi("ImportCollectionItemsBody");

export const importItemsResponseSchema = z
  .object({
    created: z.number().int().openapi({ example: 8 }),
    skipped: z.number().int().openapi({ example: 2 }),
  })
  .openapi("ImportCollectionItemsResponse");

export type CollectionItem = z.infer<typeof collectionItemSchema>;
export type CreateItemBody = z.infer<typeof createItemBodySchema>;
export type UpdateItemBody = z.infer<typeof updateItemBodySchema>;
export type EnrichBody = z.infer<typeof enrichBodySchema>;

/**
 * Shapes a Prisma collection-item detail (with its enrichments) into the
 * {@link collectionItemDetailSchema} form: drops the enrichment `itemId` and
 * narrows the JSON `content` to the schema's record type.
 */
export function serializeItemDetail(item: {
  id: string;
  ownerId: string;
  appId: string;
  type: CollectionItemType;
  source: string;
  url: string | null;
  title: string | null;
  note: string | null;
  tags: string[];
  status: string;
  mastery: number;
  enrichStatus: string;
  enrichError: string | null;
  createdAt: Date;
  updatedAt: Date;
  enrichments: Array<{
    id: string;
    kind: string;
    content: unknown;
    model: string;
    generatedAt: Date;
  }>;
  attachments: Array<{ id: string; visibility: string }>;
}) {
  return {
    id: item.id,
    ownerId: item.ownerId,
    appId: item.appId,
    type: item.type,
    source: item.source,
    url: item.url,
    title: item.title,
    note: item.note,
    tags: item.tags,
    status: item.status,
    mastery: item.mastery,
    enrichStatus: item.enrichStatus as EnrichStatus,
    enrichError: item.enrichError,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    enrichments: item.enrichments.map((e) => ({
      id: e.id,
      kind: e.kind,
      content: e.content as Record<string, unknown>,
      model: e.model,
      generatedAt: e.generatedAt,
    })),
    attachments: item.attachments.map((a) => ({
      id: a.id,
      url: `/api/attachment/${a.id}`,
    })),
  };
}
