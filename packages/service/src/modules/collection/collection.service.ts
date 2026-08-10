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
import { collectionRepository } from "./collection.repository";

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
