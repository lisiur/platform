import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireSession } from "#extractors/session";
import { forbiddenResponse, notFoundResponse, okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { signFile as generateSignedUrl } from "#services/upload.service";
import {
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(signedUrlResponseSchema, "Signed URL generated"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const { id } = c.req.valid("param");

    const result = await generateSignedUrl({
      id,
      userId: session.user.id,
    });

    return c.json(result, 200);
  },
});
