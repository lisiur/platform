import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Prisma } from "#generated/prisma/client";
import { MAX_UPLOAD_FILE_SIZE, UPLOAD_SIGN_EXPIRY_MS } from "#lib/constants";
import { prisma } from "#lib/db";
import {
  allowedMimeTypes,
  extensionForMime,
  verifyMagicBytes,
} from "#lib/mime";
import { getConfigRow } from "./system-config.service";

const UPLOADS_ROOT = join(process.cwd(), "uploads");
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

export async function createAttachment(params: {
  file: File;
  visibility: string;
  uploaderId: string;
  bizType: string;
  bizId?: string;
  tx?: Prisma.TransactionClient;
}) {
  const {
    file,
    visibility,
    uploaderId,
    bizType,
    bizId = uploaderId,
    tx = prisma,
  } = params;
  const allowedTypes = allowedMimeTypes();

  if (!allowedTypes.includes(file.type)) {
    throw new HTTPException(400, {
      message: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
    });
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    throw new HTTPException(400, {
      message: `File too large. Maximum size: ${MAX_UPLOAD_FILE_SIZE / 1024 / 1024}MB`,
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
  const dbPath = `${dir}/${relPath}`;

  let upload = await tx.upload.findUnique({
    where: { hash },
  });

  if (!upload) {
    await mkdir(join(UPLOADS_ROOT, dir, dirname(relPath)), {
      recursive: true,
    });
    await writeFile(fullPath, buffer);

    upload = await tx.upload.create({
      data: {
        path: dbPath,
        mimeType: file.type,
        size: file.size,
        hash,
      },
    });
  }

  const attachment = await tx.attachment.create({
    data: {
      bizType,
      bizId,
      uploadId: upload.id,
      visibility,
      createdBy: uploaderId,
    },
  });

  return {
    attachmentId: attachment.id,
    uploadId: upload.id,
    url: `/api/attachment/${attachment.id}`,
  };
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

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { upload: true },
  });
  if (!attachment) {
    throw new HTTPException(404, { message: "File not found" });
  }

  if (attachment.visibility === "private") {
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

  if (attachment.visibility === "public") {
    await assertHotlinkAllowed(headers);
  }

  const filePath = join(UPLOADS_ROOT, attachment.upload.path);

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
    path: attachment.upload.path,
    mimeType: attachment.upload.mimeType,
    size: attachment.upload.size,
    visibility: attachment.visibility,
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
  const config = await getConfigRow("upload", "hotlink");
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

  const attachment = await prisma.attachment.findUnique({
    where: { id },
  });
  if (!attachment) {
    throw new HTTPException(404, { message: "File not found" });
  }

  const isOwner =
    attachment.bizType === "user:avatar" && attachment.bizId === userId;
  if (!isOwner) {
    throw new HTTPException(403, { message: "Not file owner" });
  }

  const expiresAt = Date.now() + UPLOAD_SIGN_EXPIRY_MS;
  const token = createHmac("sha256", getSignSecret())
    .update(`${id}:${expiresAt}`)
    .digest("hex");

  const url = `/api/attachment/${id}?token=${token}&expires=${expiresAt}`;

  return { url, expiresAt: new Date(expiresAt) };
}

export async function listAttachments(params: {
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
    createdBy?: { equals: string };
    createdAt?: { gte?: Date; lte?: Date };
  } = {};
  if (visibility) where.visibility = visibility;
  if (mimeType) where.mimeType = { contains: mimeType, mode: "insensitive" };
  if (uploader) where.createdBy = { equals: uploader };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const [attachments, total] = await Promise.all([
    prisma.attachment.findMany({
      where,
      select: {
        id: true,
        bizType: true,
        bizId: true,
        visibility: true,
        createdBy: true,
        createdAt: true,
        upload: {
          select: {
            id: true,
            path: true,
            mimeType: true,
            size: true,
            hash: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.attachment.count({ where }),
  ]);

  return { attachments, total };
}

export type AttachmentActor = {
  userId: string;
  canManageAll: boolean;
};

export async function deleteAttachments(
  ids: string[],
  actor: AttachmentActor,
): Promise<string[]> {
  const scopeWhere = actor.canManageAll ? {} : { createdBy: actor.userId };
  const attachments = await prisma.attachment.findMany({
    where: { id: { in: ids }, ...scopeWhere },
    include: { upload: true },
  });

  const scopedIds = attachments.map((a) => a.id);
  await prisma.attachment.deleteMany({
    where: { id: { in: scopedIds }, ...scopeWhere },
  });

  for (const attachment of attachments) {
    const remainingCount = await prisma.attachment.count({
      where: { uploadId: attachment.uploadId },
    });
    if (remainingCount === 0) {
      try {
        await unlink(join(UPLOADS_ROOT, attachment.upload.path));
      } catch {
        // File already absent — ignore.
      }
      await prisma.upload.delete({ where: { id: attachment.uploadId } });
    }
  }

  return scopedIds;
}

export async function deleteAttachmentsByBiz(
  bizType: string,
  bizId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const attachments = await tx.attachment.findMany({
    where: { bizType, bizId },
    include: { upload: true },
  });

  if (attachments.length === 0) return;

  await tx.attachment.deleteMany({
    where: { id: { in: attachments.map((a) => a.id) } },
  });

  for (const attachment of attachments) {
    const remainingCount = await tx.attachment.count({
      where: { uploadId: attachment.uploadId },
    });
    if (remainingCount === 0) {
      try {
        await unlink(join(UPLOADS_ROOT, attachment.upload.path));
      } catch {
        // File already absent — ignore.
      }
      await tx.upload.delete({ where: { id: attachment.uploadId } });
    }
  }
}

export async function replaceAttachment(params: {
  id: string;
  file: File;
  actor: AttachmentActor;
}) {
  const { id, file, actor } = params;
  const allowedTypes = allowedMimeTypes();

  if (!allowedTypes.includes(file.type)) {
    throw new HTTPException(400, {
      message: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
    });
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    throw new HTTPException(400, {
      message: `File too large. Maximum size: ${MAX_UPLOAD_FILE_SIZE / 1024 / 1024}MB`,
    });
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { upload: true },
  });
  if (!attachment) {
    throw new HTTPException(404, { message: "File not found" });
  }
  if (!actor.canManageAll && attachment.createdBy !== actor.userId) {
    throw new HTTPException(403, { message: "Permission denied" });
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
  const dir = attachment.visibility === "public" ? "public" : "private";
  const fullPath = join(UPLOADS_ROOT, dir, relPath);
  const dbPath = `${dir}/${relPath}`;

  const oldUpload = attachment.upload;
  const oldPath = oldUpload.path;

  if (hash !== oldUpload.hash) {
    await mkdir(join(UPLOADS_ROOT, dir, dirname(relPath)), {
      recursive: true,
    });
    await writeFile(fullPath, buffer);

    const newUpload = await prisma.upload.create({
      data: {
        path: dbPath,
        mimeType: file.type,
        size: file.size,
        hash,
      },
    });

    await prisma.attachment.update({
      where: { id },
      data: { uploadId: newUpload.id },
    });

    const remainingCount = await prisma.attachment.count({
      where: { uploadId: oldUpload.id },
    });
    if (remainingCount === 0) {
      try {
        await unlink(join(UPLOADS_ROOT, oldPath));
      } catch {
        // Old file already absent — ignore.
      }
      await prisma.upload.delete({ where: { id: oldUpload.id } });
    }

    return { attachmentId: id, uploadId: newUpload.id };
  }

  if (dbPath !== oldUpload.path) {
    await mkdir(join(UPLOADS_ROOT, dir, dirname(relPath)), {
      recursive: true,
    });
    await writeFile(fullPath, buffer);

    await prisma.upload.update({
      where: { id: oldUpload.id },
      data: { path: dbPath, mimeType: file.type, size: file.size },
    });
  }

  return { attachmentId: id, uploadId: oldUpload.id };
}
