import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOADS_ROOT = join(process.cwd(), "uploads");
const SIGN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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
  return `${hash[0]}/${hash[1]}/${hash}${ext}`;
}

export async function uploadFile(params: {
  file: File;
  visibility: string;
  uploaderId: string;
}) {
  const { file, visibility, uploaderId } = params;

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new HTTPException(400, {
      message: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}`,
    });
  }

  if (file.size > MAX_SIZE) {
    throw new HTTPException(400, {
      message: `File too large. Maximum size: ${MAX_SIZE / 1024 / 1024}MB`,
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = computeHash(buffer);
  const ext = extname(file.name) || ".bin";
  const relPath = shardPath(hash, ext);
  const dir = visibility === "public" ? "public" : "private";
  const fullPath = join(UPLOADS_ROOT, dir, relPath);

  await mkdir(join(UPLOADS_ROOT, dir, hash[0], hash[1]), {
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
}) {
  const { id, token, expires } = params;

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
  });

  return {
    stream: webStream,
    mimeType: upload.mimeType,
    size: upload.size,
    visibility: upload.visibility,
  };
}

export async function signFile(params: {
  id: string;
  userId: string;
  userRole?: string | null;
}) {
  const { id, userId, userRole } = params;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    throw new HTTPException(404, { message: "File not found" });
  }

  const isAdmin = userRole === "admin";
  const isOwner = upload.uploaderId === userId;
  if (!isAdmin && !isOwner) {
    throw new HTTPException(403, { message: "Not file owner" });
  }

  const expiresAt = Date.now() + SIGN_EXPIRY_MS;
  const token = createHmac("sha256", getSignSecret())
    .update(`${id}:${expiresAt}`)
    .digest("hex");

  const url = `/api/upload/${id}?token=${token}&expires=${expiresAt}`;

  return { url, expiresAt: new Date(expiresAt) };
}
