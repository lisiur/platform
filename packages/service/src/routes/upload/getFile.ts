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

    const { stream, mimeType, size, visibility } = await getFileAccess({
      id,
      token,
      expires,
      headers: c.req.raw.headers,
    });

    const inlineImageTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const isInlineImage = inlineImageTypes.includes(mimeType);

    return new Response(stream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": isInlineImage ? "inline" : "attachment",
        "Cache-Control":
          visibility === "public"
            ? "public, max-age=31536000"
            : "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  },
});
