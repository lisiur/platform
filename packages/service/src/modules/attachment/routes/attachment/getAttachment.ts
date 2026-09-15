import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { forbiddenResponse, notFoundResponse } from "#lib/openapi";
import { getFileAccess } from "#modules/attachment/attachment.service";
import { getAttachmentParamSchema, getAttachmentQuerySchema } from "./schema";

// Public attachments are content-addressed by sha256 and the id is never
// re-pointed in normal operation — avatar replacement mints a new
// attachment id and a new URL — so a stored copy stays valid for as long
// as the client keeps it. `private` (not `public`) keeps copies out of
// shared caches: the hotlink check is request-header-dependent and its
// config is DB-tunable at runtime, so intermediaries must not pin a
// per-request verdict.
const PUBLIC_CACHE_CONTROL = "private, max-age=31536000, immutable";

export const getAttachment = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAttachment",
    method: "get",
    path: "/{id}",
    tags: ["Attachment"],
    summary: "Get a file",
    description:
      "Access a file by ID. Public files are served directly. Private files require a signed URL.",
    request: {
      params: getAttachmentParamSchema,
      query: getAttachmentQuerySchema,
    },
    responses: {
      200: {
        description: "File content",
      },
      ...forbiddenResponse,
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { token, expires } = c.req.valid("query");

    const { stream, path, mimeType, size, visibility } = await getFileAccess({
      id,
      token,
      expires,
      headers: c.req.raw.headers,
    });

    const etag = `"${path}"`;

    if (c.req.header("if-none-match") === etag) {
      await stream.cancel();
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          // Repeating the fresh directive lets a revalidation after
          // max-age expiry extend the stored entry instead of flipping
          // it back to must-revalidate.
          "Cache-Control":
            visibility === "public" ? PUBLIC_CACHE_CONTROL : "no-cache",
        },
      });
    }

    const inlineImageTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "image/svg+xml",
    ];
    const isInlineImage = inlineImageTypes.includes(mimeType);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": isInlineImage ? "inline" : "attachment",
      "Cache-Control":
        visibility === "public" ? PUBLIC_CACHE_CONTROL : "private, no-store",
      ETag: etag,
      "Referrer-Policy": "no-referrer",
    };

    if (mimeType === "image/svg+xml") {
      headers["Content-Security-Policy"] =
        "default-src 'none'; base-uri 'none'";
    }

    return new Response(stream, { headers });
  },
});
