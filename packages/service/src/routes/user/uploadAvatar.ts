import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { uploadAvatar as uploadAvatarSvc } from "#services/user.service";

export const uploadAvatarResponseSchema = z
  .object({
    url: z.string().openapi({ example: "/api/attachment/clx1234567890" }),
    attachmentId: z.string().openapi({ example: "clx1234567890" }),
  })
  .openapi("UploadAvatarResponse");

const uploadAvatarBodySchema = z.object({
  file: z.any().openapi({ description: "Avatar image file" }),
});

export const uploadAvatar = defineOpenAPIRoute({
  route: createRoute({
    operationId: "uploadAvatar",
    method: "post",
    path: "/upload-avatar",
    tags: ["User"],
    summary: "Upload user avatar",
    description:
      "Upload an avatar image for the current user. Creates attachment and cleans up old avatar.",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: uploadAvatarBodySchema,
          },
        },
      },
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...okResponseFn(
        uploadAvatarResponseSchema,
        "Avatar uploaded successfully",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = c.req.valid("form");
    const file = body.file;

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

    const result = await uploadAvatarSvc(userId, file);

    return c.json(
      {
        url: result.url,
        attachmentId: result.attachmentId,
      },
      200,
    );
  },
});
