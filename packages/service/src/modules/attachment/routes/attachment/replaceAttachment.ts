import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess, checkPermission } from "#modules/access-control/public";
import { replaceAttachment as replaceAttachmentFile } from "#modules/attachment/attachment.service";
import {
  replaceAttachmentParamSchema,
  replaceAttachmentResponseSchema,
} from "./schema";

const replaceAttachmentBodySchema = z.object({
  file: z.any().openapi({ description: "Replacement file" }),
});

export const replaceAttachmentRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "replaceAttachment",
    method: "put",
    path: "/{id}/replace",
    tags: ["Attachment"],
    summary: "Replace an attachment",
    description:
      "Overwrite the file content of an existing attachment, keeping its id and access URL. Accepts multipart/form-data with a `file` field.",
    request: {
      params: replaceAttachmentParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: replaceAttachmentBodySchema,
          },
        },
      },
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        replaceAttachmentResponseSchema,
        "Attachment replaced successfully",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/attachment:replace");
    const userId = getPrincipalUserId(principal);
    const canManageAll = await checkPermission(
      userId,
      "system/attachment:manage-all",
    );

    const { id } = c.req.valid("param");

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

    const updated = await replaceAttachmentFile({
      id,
      file,
      actor: { userId, canManageAll },
    });

    await logAudit({
      event: "attachment.replaced",
      category: "file_management",
      severity: "info",
      c,
    });

    return c.json(updated, 200);
  },
});
