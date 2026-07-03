import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { prisma } from "#lib/db";
import {
  allowedMimeTypes,
  extensionForMime,
  verifyMagicBytes,
} from "#lib/mime";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOADS_ROOT = join(process.cwd(), "uploads");
const SIGN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_HOTLINK_CONFIG = {
  enabled: false,
  allowedDomains: [],
  allowEmptyReferer: true,
};
const hotlinkConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_HOTLINK_CONFIG.enabled),
  allowedDomains: z
    .array(z.string())
    .default(DEFAULT_HOTLINK_CONFIG.allowedDomains),
  allowEmptyReferer: z
    .boolean()
    .default(DEFAULT_HOTLINK_CONFIG.allowEmptyReferer),
});

function getSignSecret(): string {
  const secret = process.env.UPLOAD_SIGN_SECRET;
  if (!secret) {
    throw new HTTPException(500, {
      message: "UPLOAD_SIGN_SECRET required for private file operations",
    });
  }
  return secret;
}

function computeHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function shardPath(hash: string, ext: string): string {
  return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${ext}`;
}

export async function uploadFile(params: {
  file: File;
  visibility: string;
  uploaderId: string;
}) {
  const { file, visibility, uploaderId } = params;
  const allowedTypes = allowedMimeTypes();

  if (!allowedTypes.includes(file.type)) {
    throw new HTTPException(400, {
      message: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
    });
  }

  if (file.size > MAX_SIZE) {
    throw new HTTPException(400, {
      message: `File too large. Maximum size: ${MAX_SIZE / 1024 / 1024}MB`,
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!verifyMagicBytes(buffer, file.type)) {
    throw new HTTPException(400, {
      message: "File content does not match its declared type",
    });
  }

  const ext = extensionForMime(file.type);
  if (!ext) {
    throw new HTTPException(400, { message: "Unsupported file type" });
  }

  const hash = computeHash(buffer);
  const relPath = shardPath(hash, ext);
  const dir = visibility === "public" ? "public" : "private";
  const fullPath = join(UPLOADS_ROOT, dir, relPath);

  await mkdir(join(UPLOADS_ROOT, dir, dirname(relPath)), {
    recursive: true,
  });
  await writeFile(fullPath, buffer);

  const dbPath = `${dir}/${relPath}`;

  const upload = await prisma.upload.create({
    data: {
      path: dbPath,
      mimeType: file.type,
      size: file.size,
      visibility,
      uploaderId,
    },
  });

  return { id: upload.id, url: `/api/upload/${upload.id}` };
}

export function verifySignature(
  id: string,
  expires: string,
  token: string,
): boolean {
  const expected = createHmac("sha256", getSignSecret())
    .update(`${id}:${expires}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function getFileAccess(params: {
  id: string;
  token?: string;
  expires?: string;
  headers?: Headers;
}) {
  const { id, token, expires, headers } = params;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    throw new HTTPException(404, { message: "File not found" });
  }

  if (upload.visibility === "private") {
    if (!token || !expires) {
      throw new HTTPException(403, {
        message: "Token required for private files",
      });
    }

    const expiresMs = Number(expires);
    if (Number.isNaN(expiresMs) || Date.now() > expiresMs) {
      throw new HTTPException(403, { message: "Signed URL expired" });
    }

    if (!verifySignature(id, expires, token)) {
      throw new HTTPException(403, { message: "Invalid signature" });
    }
  }

  await assertHotlinkAllowed(headers);

  const filePath = join(UPLOADS_ROOT, upload.path);

  try {
    await stat(filePath);
  } catch {
    throw new HTTPException(404, { message: "File not found on disk" });
  }

  const stream = createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf));
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return {
    stream: webStream,
    path: upload.path,
    mimeType: upload.mimeType,
    size: upload.size,
    visibility: upload.visibility,
  };
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

function getRequestHostname(headers?: Headers): string | null {
  const source = headers?.get("referer") ?? headers?.get("origin");
  if (!source) return null;
  try {
    return new URL(source).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function getUploadHotlinkConfig() {
  const config = await prisma.systemConfig.findUnique({
    where: { group_key: { group: "upload", key: "hotlink" } },
  });
  if (!config) return DEFAULT_HOTLINK_CONFIG;

  try {
    return hotlinkConfigSchema.parse(JSON.parse(config.value));
  } catch {
    return DEFAULT_HOTLINK_CONFIG;
  }
}

async function assertHotlinkAllowed(headers?: Headers) {
  const config = await getUploadHotlinkConfig();
  if (!config.enabled) return;

  const hostname = getRequestHostname(headers);
  if (hostname === null) {
    if (config.allowEmptyReferer) return;
    throw new HTTPException(403, {
      message: "Hotlink protection blocked access",
    });
  }

  if (hostname === "") {
    throw new HTTPException(403, {
      message: "Hotlink protection blocked access",
    });
  }

  const allowedDomains = new Set(config.allowedDomains.map(normalizeDomain));
  if (!allowedDomains.has(hostname)) {
    throw new HTTPException(403, {
      message: "Hotlink protection blocked access",
    });
  }
}

export async function signFile(params: { id: string; userId: string }) {
  const { id, userId } = params;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    throw new HTTPException(404, { message: "File not found" });
  }

  const isOwner = upload.uploaderId === userId;
  if (!isOwner) {
    throw new HTTPException(403, { message: "Not file owner" });
  }

  const expiresAt = Date.now() + SIGN_EXPIRY_MS;
  const token = createHmac("sha256", getSignSecret())
    .update(`${id}:${expiresAt}`)
    .digest("hex");

  const url = `/api/upload/${id}?token=${token}&expires=${expiresAt}`;

  return { url, expiresAt: new Date(expiresAt) };
}

export async function listUploads(params: {
  limit?: number;
  offset?: number;
  visibility?: string;
  mimeType?: string;
  uploader?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    limit = 10,
    offset = 0,
    visibility,
    mimeType,
    uploader,
    startDate,
    endDate,
  } = params;

  const where: {
    visibility?: string;
    mimeType?: { contains: string; mode: "insensitive" };
    uploader?: { OR: Array<Record<string, unknown>> };
    createdAt?: { gte?: Date; lte?: Date };
  } = {};
  if (visibility) where.visibility = visibility;
  if (mimeType) where.mimeType = { contains: mimeType, mode: "insensitive" };
  if (uploader) {
    where.uploader = {
      OR: [
        { name: { contains: uploader, mode: "insensitive" } },
        { email: { contains: uploader, mode: "insensitive" } },
      ],
    };
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const [uploads, total] = await Promise.all([
    prisma.upload.findMany({
      where,
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.upload.count({ where }),
  ]);

  return { uploads, total };
}

export async function deleteUploads(ids: string[]) {
  const uploads = await prisma.upload.findMany({
    where: { id: { in: ids } },
  });

  await prisma.upload.deleteMany({
    where: { id: { in: ids } },
  });

  await Promise.all(
    uploads.map(async (upload) => {
      const refCount = await prisma.upload.count({
        where: { path: upload.path },
      });
      if (refCount === 0) {
        try {
          await unlink(join(UPLOADS_ROOT, upload.path));
        } catch {
          // File already absent — ignore.
        }
      }
    }),
  );
}

export async function replaceUpload(params: { id: string; file: File }) {
  const { id, file } = params;
  const allowedTypes = allowedMimeTypes();

  if (!allowedTypes.includes(file.type)) {
    throw new HTTPException(400, {
      message: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
    });
  }

  if (file.size > MAX_SIZE) {
    throw new HTTPException(400, {
      message: `File too large. Maximum size: ${MAX_SIZE / 1024 / 1024}MB`,
    });
  }

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    throw new HTTPException(404, { message: "File not found" });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!verifyMagicBytes(buffer, file.type)) {
    throw new HTTPException(400, {
      message: "File content does not match its declared type",
    });
  }

  const ext = extensionForMime(file.type);
  if (!ext) {
    throw new HTTPException(400, { message: "Unsupported file type" });
  }

  const hash = computeHash(buffer);
  const relPath = shardPath(hash, ext);
  const dir = upload.visibility === "public" ? "public" : "private";
  const fullPath = join(UPLOADS_ROOT, dir, relPath);
  const dbPath = `${dir}/${relPath}`;

  if (dbPath !== upload.path) {
    await mkdir(join(UPLOADS_ROOT, dir, dirname(relPath)), {
      recursive: true,
    });
    await writeFile(fullPath, buffer);

    const refCount = await prisma.upload.count({
      where: { path: upload.path },
    });
    if (refCount <= 1) {
      try {
        await unlink(join(UPLOADS_ROOT, upload.path));
      } catch {
        // Old file already absent — ignore.
      }
    }
  }

  const updated = await prisma.upload.update({
    where: { id },
    data: { path: dbPath, mimeType: file.type, size: file.size },
    include: {
      uploader: { select: { id: true, name: true, email: true } },
    },
  });

  return updated;
}
