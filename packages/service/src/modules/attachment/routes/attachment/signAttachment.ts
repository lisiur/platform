import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { signFile as generateSignedUrl } from "#modules/attachment/attachment.service";
import { signAttachmentParamSchema, signedUrlResponseSchema } from "./schema";

export const signAttachment = defineOpenAPIRoute({
  route: createRoute({
    operationId: "signAttachment",
    method: "post",
    path: "/{id}/sign",
    tags: ["Attachment"],
    summary: "Generate signed URL for a private file",
    description: "Create a time-limited signed URL to access a private file.",
    request: {
      params: signAttachmentParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(signedUrlResponseSchema, "Signed URL generated"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);

    const { id } = c.req.valid("param");

    const result = await generateSignedUrl({
      id,
      userId: getPrincipalUserId(principal),
    });

    return c.json(result, 200);
  },
});
