import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { STUDYBUDDY_APP_CODE } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import type { CollectionItemType } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import {
  createAttachment,
  deleteAttachmentsByBiz,
} from "#modules/attachment/attachment.service";
import { eventBus } from "#states";
import { collectionRepository } from "./collection.repository";
import { enrichItem } from "./enrich.service";

const ATTACHMENT_BIZ_TYPE = "collection-item";
const LINK_FETCH_TIMEOUT_MS = 6_000;
const LINK_FETCH_MAX_BYTES = 2_000_000;
const LINK_FETCH_MAX_REDIRECTS = 4;

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

interface LinkMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

function readMeta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : null;
}

/**
 * Returns true for IP addresses that point at private or internal networks.
 * Used to harden user-driven fetches (link previews, og:image ingest) against
 * SSRF: cloud metadata endpoints (169.254.169.254), loopback, RFC1918 space,
 * etc. Unknown families are treated as unsafe.
 */
function isPrivateTarget(ip: string): boolean {
  if (isIPv4(ip)) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && (b & 0xf0) === 16) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && (b & 0xc0) === 64) return true; // 100.64.0.0/10 CGN
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    return false;
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    )
      return true; // fe80::/10 link-local
    if (lower.startsWith("ff")) return true; // multicast
    const v4mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped && isPrivateTarget(v4mapped[1])) return true; // IPv4-mapped
    return false;
  }
  return true;
}

async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Disallowed protocol: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname;
  const literal = isIPv4(hostname) || isIPv6(hostname) ? [hostname] : [];
  const resolved =
    literal.length > 0
      ? literal
      : await lookup(hostname, { all: true }).then((r) =>
          r.map((a) => a.address),
        );
  if (resolved.length === 0) {
    throw new Error(`Unresolvable host: ${hostname}`);
  }
  for (const addr of resolved) {
    if (isPrivateTarget(addr)) {
      throw new Error(`Blocked internal target: ${hostname}`);
    }
  }
}

/**
 * Fetches a user-supplied URL while mitigating SSRF: each hop (initial request
 * and every redirect) is re-resolved and rejected if it points at a private or
 * internal address. Redirects are followed manually so cross-protocol hops and
 * internal-IP redirects cannot bypass the check.
 */
async function safeFetch(
  rawUrl: string,
  init: { signal: AbortSignal; headers?: Record<string, string> },
): Promise<Response> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= LINK_FETCH_MAX_REDIRECTS; hop++) {
    await assertPublicUrl(currentUrl);
    const res = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      const next = resolveUrl(currentUrl, location);
      if (!next) return res;
      currentUrl = next;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(rawUrl, {
      signal: controller.signal,
      headers: { "user-agent": "StudyBuddy/1.0 (+link-preview)" },
    });
    if (!res.ok) {
      return { title: null, description: null, imageUrl: null };
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) {
      return { title: null, description: null, imageUrl: null };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return { title: null, description: null, imageUrl: null };
    }
    let raw = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      raw += new TextDecoder().decode(value, { stream: true });
      if (bytes >= LINK_FETCH_MAX_BYTES || raw.includes("</head>")) break;
    }
    await reader.cancel();

    const title =
      readMeta(raw, "og:title") ??
      readMeta(raw, "twitter:title") ??
      readTitleTag(raw);
    const description =
      readMeta(raw, "og:description") ??
      readMeta(raw, "twitter:description") ??
      readMeta(raw, "description");
    const imageUrl =
      readMeta(raw, "og:image") ?? readMeta(raw, "twitter:image");

    return {
      title: title?.slice(0, 500) ?? null,
      description: description?.slice(0, 2000) ?? null,
      imageUrl: resolveUrl(rawUrl, imageUrl),
    };
  } catch {
    return { title: null, description: null, imageUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(base: string, maybe: string | null): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

async function ingestOgImage(
  itemId: string,
  ownerId: string,
  imageUrl: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(imageUrl, { signal: controller.signal });
    if (!res.ok) return;
    const mime = res.headers.get("content-type") ?? "application/octet-stream";
    if (!mime.startsWith("image/")) return;
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = imageUrl.split("/").pop()?.split("?")[0] || "image";
    const file = new File([buf], filename, { type: mime });
    await createAttachment({
      file,
      visibility: "public",
      uploaderId: ownerId,
      bizType: ATTACHMENT_BIZ_TYPE,
      bizId: itemId,
    });
  } catch {
    // Best-effort: image ingest failures never block item creation.
  } finally {
    clearTimeout(timer);
  }
}

export async function listItems(
  ownerId: string,
  params: {
    type?: CollectionItemType;
    tag?: string;
    q?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
) {
  const { type, tag, q, status, limit, offset } = params;
  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (tag) where.tags = { has: tag };
  if (status) where.status = status;
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
  if (item.type === "LINK") {
    throw new HTTPException(400, {
      message: "Link items do not support AI enrichment",
    });
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

  const item = await collectionRepository.create({
    ownerId: input.ownerId,
    appId,
    type: input.type,
    source: input.source,
    url: input.url ?? null,
    title: input.title ?? null,
    note: input.note ?? null,
    tags: input.tags ?? [],
    enrichStatus: input.type === "LINK" ? "none" : "pending",
  });

  if (input.type === "LINK") {
    const meta = await fetchLinkMetadata(input.source);
    const title = input.title ?? meta.title;
    const note = input.note ?? meta.description;
    if (title !== item.title || note !== item.note) {
      await collectionRepository.update(item.id, {
        title: title ?? null,
        note: note ?? null,
      });
    }
    if (meta.imageUrl) {
      await ingestOgImage(item.id, input.ownerId, meta.imageUrl);
    }
  } else {
    // Enrichments are generated automatically right after the item is added;
    // failures never block item creation — they are persisted on the item so
    // the UI can surface them.
    void runAutoEnrichment(input.ownerId, item.id);
  }

  const detail = await collectionRepository.findOwnedById(
    input.ownerId,
    item.id,
  );
  if (!detail) {
    throw new HTTPException(500, { message: "Failed to read created item" });
  }
  const attachments = await fetchItemAttachments(item.id);
  return { ...detail, attachments };
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
