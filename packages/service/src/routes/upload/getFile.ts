import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { forbiddenResponse, notFoundResponse } from "#lib/openapi";
import { getFileAccess } from "#services/upload.service";
import { getFileParamSchema, getFileQuerySchema } from "./schema";

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
          "Cache-Control": "no-cache",
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

    return new Response(stream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": isInlineImage ? "inline" : "attachment",
        "Cache-Control":
          visibility === "public" ? "no-cache" : "private, no-store",
        ETag: etag,
        "Referrer-Policy": "no-referrer",
      },
    });
  },
});
