import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { errorSchema, uploadResponseSchema } from "./schema";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOADS_ROOT = join(process.cwd(), "uploads");

function computeHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function shardPath(hash: string, ext: string): string {
  return `${hash[0]}/${hash[1]}/${hash}${ext}`;
}

export const uploadFile = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Upload"],
    summary: "Upload a file",
    description:
      "Upload a file with sharded storage and public/private visibility.",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: uploadResponseSchema,
          },
        },
        description: "File uploaded successfully",
      },
      400: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Invalid file type or size",
      },
      401: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = await c.req.parseBody();
    const file = body.file;
    const visibility = (body.visibility as string) || "private";

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

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
        uploaderId: session.user.id,
      },
    });

    return c.json(
      {
        id: upload.id,
        url: `/api/upload/${upload.id}`,
      },
      200,
    );
  },
});
