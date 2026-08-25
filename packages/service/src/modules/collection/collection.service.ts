import { STUDYBUDDY_APP_CODE } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import type { CollectionItemType } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { deleteAttachmentsByBiz } from "#modules/attachment/attachment.service";
import { eventBus } from "#states";
import { collectionRepository } from "./collection.repository";
import { enrichItem } from "./enrich.service";

const ATTACHMENT_BIZ_TYPE = "collection-item";

export const COLLECTION_ITEM_STATUSES = [
  "active",
  "archived",
  "learned",
] as const;

export type CreateItemInput = {
  ownerId: string;
  appId?: string;
  type: CollectionItemType;
  source: string;
  url?: string | null;
  title?: string | null;
  note?: string | null;
  tags?: string[];
};

export type UpdateItemInput = {
  title?: string | null;
  note?: string | null;
  tags?: string[];
  status?: string;
  mastery?: number;
  url?: string | null;
};

export async function resolveStudybuddyAppId(): Promise<string> {
  const app = await prisma.application.findUnique({
    where: { code: STUDYBUDDY_APP_CODE },
    select: { id: true },
  });
  if (!app) {
    throw new HTTPException(500, {
      message: "StudyBuddy application is not registered",
    });
  }
  return app.id;
}

export async function listItems(
  ownerId: string,
  params: {
    type?: CollectionItemType;
    tag?: string;
    q?: string;
    status?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  },
) {
  const { type, tag, q, status, from, to, limit, offset } = params;
  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (tag) where.tags = { has: tag };
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };
  }
  if (q) {
    where.OR = [
      { source: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    collectionRepository.findMany({ ownerId, where, limit, offset }),
    collectionRepository.count({ ownerId, where }),
  ]);
  return { items, total };
}

export const COLLECTION_EXPORT_VERSION = 1;

const ITEM_STATUSES = COLLECTION_ITEM_STATUSES;
const ENRICH_STATUSES = ["none", "pending", "ok", "failed"] as const;

type ItemStatus = (typeof ITEM_STATUSES)[number];
type EnrichStatusValue = (typeof ENRICH_STATUSES)[number];

function asItemStatus(value: string): ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value)
    ? (value as ItemStatus)
    : "active";
}

function asEnrichStatus(value: string): EnrichStatusValue {
  return (ENRICH_STATUSES as readonly string[]).includes(value)
    ? (value as EnrichStatusValue)
    : "none";
}

function asImportedEnrichStatus(value: string | undefined): EnrichStatusValue {
  const status = asEnrichStatus(value ?? "none");
  return status === "pending" ? "none" : status;
}

export type ImportItemInput = {
  type: CollectionItemType;
  source: string;
  url?: string | null;
  title?: string | null;
  note?: string | null;
  tags: string[];
  status?: string;
  mastery?: number;
  enrichStatus?: string;
  createdAt?: Date;
  enrichments: Array<{
    kind: string;
    content: Record<string, unknown>;
    model: string;
    generatedAt?: Date;
  }>;
};

export async function exportItems(ownerId: string) {
  const items = await collectionRepository.findAllWithEnrichments(ownerId);
  return {
    version: COLLECTION_EXPORT_VERSION,
    exportedAt: new Date(),
    items: items.map((item) => ({
      type: item.type,
      source: item.source,
      url: item.url,
      title: item.title,
      note: item.note,
      tags: item.tags,
      status: asItemStatus(item.status),
      mastery: item.mastery,
      enrichStatus: asEnrichStatus(item.enrichStatus),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      enrichments: item.enrichments.map((e) => ({
        kind: e.kind,
        content: e.content as Record<string, unknown>,
        model: e.model,
        generatedAt: e.generatedAt,
      })),
    })),
  };
}

/**
 * Creates collection items from an export file. Items whose `source` already
 * exists in the owner's collection (or appears twice in the file) are skipped;
 * returns how many were created and skipped. Enrichments bundled with an item
 * are restored as-is; items without enrichments land in their imported status,
 * except "pending" which is coerced to "none" — no auto-enrichment is
 * triggered on import.
 */
export async function importItems(ownerId: string, input: ImportItemInput[]) {
  const appId = await resolveStudybuddyAppId();

  const seen = new Set<string>();
  const unique: ImportItemInput[] = [];
  let duplicatesInFile = 0;
  for (const item of input) {
    const key = item.source.trim();
    if (seen.has(key)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(key);
    unique.push({ ...item, source: key });
  }

  const existing = await collectionRepository.findExistingSources(
    ownerId,
    unique.map((i) => i.source),
  );

  const toCreate = unique.filter((item) => !existing.has(item.source));
  const skipped = duplicatesInFile + (unique.length - toCreate.length);

  if (toCreate.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const item of toCreate) {
          await collectionRepository.createImported(
            {
              ownerId,
              appId,
              type: item.type,
              source: item.source,
              url: item.url ?? null,
              title: item.title ?? null,
              note: item.note ?? null,
              tags: item.tags,
              status: asItemStatus(item.status ?? "active"),
              mastery: item.mastery ?? 0,
              enrichStatus:
                item.enrichments.length > 0
                  ? "ok"
                  : asImportedEnrichStatus(item.enrichStatus),
              ...(item.createdAt ? { createdAt: item.createdAt } : {}),
              enrichments: item.enrichments,
            },
            tx,
          );
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  return { created: toCreate.length, skipped };
}

export async function getItem(ownerId: string, id: string) {
  const item = await collectionRepository.findOwnedById(ownerId, id);
  if (!item) {
    throw new HTTPException(404, { message: "Collection item not found" });
  }
  const attachments = await fetchItemAttachments(id);
  return { ...item, attachments };
}

export async function fetchItemAttachments(
  itemId: string,
): Promise<Array<{ id: string; visibility: string }>> {
  return prisma.attachment.findMany({
    where: { bizType: ATTACHMENT_BIZ_TYPE, bizId: itemId },
    select: { id: true, visibility: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Runs auto-enrichment in the background and persists its lifecycle status
 * (ok/failed + error message) on the item so the UI can render it.
 */
async function runAutoEnrichment(ownerId: string, itemId: string) {
  try {
    const result = await enrichItem(ownerId, itemId);
    const ok = result.generated.length > 0;
    await collectionRepository.update(itemId, {
      enrichStatus: ok ? "ok" : "failed",
      enrichError: ok ? null : "AI enrichment returned no sections",
    });
    publishItemEnriched(ownerId, itemId, ok ? "ok" : "failed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[studybuddy] auto enrichment failed:", err);
    await collectionRepository
      .update(itemId, {
        enrichStatus: "failed",
        enrichError: message.slice(0, 500),
      })
      .catch(() => {});
    publishItemEnriched(ownerId, itemId, "failed");
  }
}

function publishItemEnriched(
  ownerId: string,
  itemId: string,
  enrichStatus: "ok" | "failed",
) {
  eventBus.publish({
    type: "collection.item.enriched",
    target: `sse:${STUDYBUDDY_APP_CODE}:${ownerId}:*`,
    itemId,
    ownerId,
    enrichStatus,
  });
}

/**
 * Resets a failed auto-enrichment back to pending and re-runs it in the
 * background. Returns immediately; a `collection.item.enriched` SSE event
 * invalidates the item in the UI once enrichment finishes.
 */
export async function retryItemEnrichment(ownerId: string, itemId: string) {
  const item = await collectionRepository.findOwnedByIdLean(ownerId, itemId);
  if (!item) {
    throw new HTTPException(404, { message: "Collection item not found" });
  }
  const { count } = await collectionRepository.markEnrichmentRetryable(itemId);
  if (count === 0) {
    throw new HTTPException(409, {
      message: "Enrichment can only be retried after a failure",
    });
  }
  void runAutoEnrichment(ownerId, itemId);

  return { itemId, enrichStatus: "pending" as const };
}

export async function createItem(input: CreateItemInput) {
  const appId = input.appId ?? (await resolveStudybuddyAppId());

  // Dedupe on capture: re-adding an existing source never creates a second
  // row. The stored item is flipped back to active instead, so it shows up
  // in the 学习 deck immediately; `alreadyExists` lets clients toast it.
  const existing = await collectionRepository.findBySourceLean(
    input.ownerId,
    input.source,
  );
  if (existing) {
    if (existing.status !== "active") {
      await collectionRepository.update(existing.id, { status: "active" });
    }
    return readItemDetail(existing.id, input.ownerId, true);
  }

  const item = await collectionRepository.create({
    ownerId: input.ownerId,
    appId,
    type: input.type,
    source: input.source,
    url: input.url ?? null,
    title: input.title ?? null,
    note: input.note ?? null,
    tags: input.tags ?? [],
    enrichStatus: "pending",
  });

  // Enrichments are generated automatically right after the item is added;
  // failures never block item creation — they are persisted on the item so
  // the UI can surface them.
  void runAutoEnrichment(input.ownerId, item.id);

  return readItemDetail(item.id, input.ownerId, false);
}

async function readItemDetail(
  itemId: string,
  ownerId: string,
  alreadyExists: boolean,
) {
  const detail = await collectionRepository.findOwnedById(ownerId, itemId);
  if (!detail) {
    throw new HTTPException(500, { message: "Failed to read created item" });
  }
  const attachments = await fetchItemAttachments(itemId);
  return { ...detail, attachments, alreadyExists };
}

export async function updateItem(
  ownerId: string,
  id: string,
  data: UpdateItemInput,
) {
  const existing = await collectionRepository.findOwnedByIdLean(ownerId, id);
  if (!existing) {
    throw new HTTPException(404, { message: "Collection item not found" });
  }
  if (data.status && !COLLECTION_ITEM_STATUSES.includes(data.status as never)) {
    throw new HTTPException(400, { message: "Invalid status" });
  }
  return collectionRepository.update(id, data);
}

export async function deleteItem(ownerId: string, id: string) {
  const item = await collectionRepository.findOwnedByIdLean(ownerId, id);
  if (!item) {
    throw new HTTPException(404, { message: "Collection item not found" });
  }
  await deleteAttachmentsByBiz(ATTACHMENT_BIZ_TYPE, id);
  return collectionRepository.delete(id);
}
