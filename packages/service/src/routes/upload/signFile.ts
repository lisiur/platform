import { createHmac } from "node:crypto";
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import {
  errorSchema,
  signedUrlResponseSchema,
  signFileParamSchema,
} from "./schema";

const SIGN_SECRET =
  process.env.UPLOAD_SIGN_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  "upload-sign-default";
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export const signFile = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{id}/sign",
    tags: ["Files"],
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

    const upload = await prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      throw new HTTPException(404, { message: "File not found" });
    }

    const isAdmin = session.user.role === "admin";
    const isOwner = upload.uploaderId === session.user.id;
    if (!isAdmin && !isOwner) {
      throw new HTTPException(403, { message: "Not file owner" });
    }

    const expiresAt = Date.now() + EXPIRY_MS;
    const token = createHmac("sha256", SIGN_SECRET)
      .update(`${id}:${expiresAt}`)
      .digest("hex");

    const url = `/api/upload/${id}?token=${token}&expires=${expiresAt}`;

    return c.json({ url, expiresAt: new Date(expiresAt) }, 200);
  },
});
