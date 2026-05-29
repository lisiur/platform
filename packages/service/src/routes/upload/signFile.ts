import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { signFile as generateSignedUrl } from "#services/upload.service";
import {
  errorSchema,
  signedUrlResponseSchema,
  signFileParamSchema,
} from "./schema";

export const signFile = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{id}/sign",
    tags: ["Upload"],
    summary: "Generate signed URL for a private file",
    description: "Create a time-limited signed URL to access a private file.",
    request: {
      params: signFileParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: signedUrlResponseSchema,
          },
        },
        description: "Signed URL generated",
      },
      401: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Unauthorized",
      },
      403: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Forbidden (not file owner or admin)",
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
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const { id } = c.req.valid("param");

    const result = await generateSignedUrl({
      id,
      userId: session.user.id,
      userRole: session.user.role,
    });

    return c.json(result, 200);
  },
});
