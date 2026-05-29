import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getFileAccess } from "#services/upload.service";
import { errorSchema, getFileParamSchema, getFileQuerySchema } from "./schema";

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

    const { stream, mimeType, size, visibility } = await getFileAccess({
      id,
      token,
      expires,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "Cache-Control":
          visibility === "public"
            ? "public, max-age=31536000"
            : "private, no-store",
      },
    });
  },
});
