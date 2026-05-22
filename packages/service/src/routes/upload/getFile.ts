import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "@/lib/db";
import { errorSchema, getFileParamSchema, getFileQuerySchema } from "./schema";

const UPLOADS_ROOT = join(process.cwd(), "uploads");
const SIGN_SECRET =
  process.env.UPLOAD_SIGN_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  "upload-sign-default";

function verifySignature(id: string, expires: string, token: string): boolean {
  const expected = createHmac("sha256", SIGN_SECRET)
    .update(`${id}:${expires}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const getFile = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Files"],
    summary: "Get a file",
    description:
      "Access a file by ID. Public files are served directly. Private files require a signed URL.",
    request: {
      params: getFileParamSchema,
      query: getFileQuerySchema,
    },
    responses: {
      200: {
        description: "File content",
      },
      403: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Forbidden (invalid or expired token)",
      },
      404: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "File not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { token, expires } = c.req.valid("query");

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

    return new Response(webStream, {
      headers: {
        "Content-Type": upload.mimeType,
        "Content-Length": String(upload.size),
        "Cache-Control":
          upload.visibility === "public"
            ? "public, max-age=31536000"
            : "private, no-store",
      },
    });
  },
});
