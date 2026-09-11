import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { uploadMemberAvatar } from "../../share.service";
import { memberParamSchema } from "./schema";

const uploadMemberAvatarBodySchema = z.object({
  file: z.any().openapi({ description: "Avatar image file" }),
});

const uploadMemberAvatarResponseSchema = z
  .object({
    url: z.string().openapi({ example: "/api/attachment/clx1234567890" }),
    attachmentId: z.string().openapi({ example: "clx1234567890" }),
  })
  .openapi("QianlaiUploadMemberAvatarResponse");

export const uploadMemberAvatarRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "uploadQianlaiMemberAvatar",
    method: "post",
    path: "/ledgers/{ledgerId}/members/{userId}/avatar",
    tags: ["QianlaiShare"],
    summary: "Set a virtual member's avatar (editor+)",
    description:
      "Uploads an avatar image for a virtual member, replacing any previous one. Only virtual members can be given an avatar here — real users manage their own through their profile.",
    request: {
      params: memberParamSchema,
      body: {
        content: {
          "multipart/form-data": { schema: uploadMemberAvatarBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(
        uploadMemberAvatarResponseSchema,
        "Avatar uploaded successfully",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, userId: targetUserId } = c.req.valid("param");
    // Floor editor: setting a member's avatar is editor+, re-verified under
    // the ledger row lock in the service.
    await requireLedgerAccess(userId, ledgerId, "editor");

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = c.req.valid("form");
    if (!(body.file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

    return c.json(
      await uploadMemberAvatar(ledgerId, userId, targetUserId, body.file),
      200,
    );
  },
});
