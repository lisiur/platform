import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { MAX_UPLOAD_FILE_SIZE } from "#lib/constants";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  payloadTooLargeResponse,
  unauthorizedResponse,
  unsupportedMediaTypeResponse,
} from "#lib/openapi";
import {
  createAttachment,
  JOURNAL_ENTRY_BIZ_TYPE,
} from "#modules/attachment/attachment.service";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import {
  ledgerIdParamSchema,
  uploadEntryAttachmentResponseSchema,
} from "./schema";

/** Photo receipts only this phase — recognizeScreenshot's tile set plus
 * image/gif (the recognition pipeline wants lossless UI captures, the
 * receipt picker accepts whatever the library offers). iOS compresses
 * every pick to JPEG anyway, so the extra latitude is defensive. */
const PHOTO_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const uploadEntryAttachmentFormSchema = z.object({
  file: z.any().openapi({
    description: "One photo (image/jpeg, image/png, image/webp, or image/gif)",
  }),
});

export const uploadEntryAttachmentRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "uploadQianlaiEntryAttachment",
    method: "post",
    path: "/ledgers/{ledgerId}/entries/attachments",
    tags: ["QianlaiJournal"],
    summary: "Upload a photo receipt for a journal entry",
    description:
      "Uploads one photo (≤5MB, magic-byte verified) as a private attachment " +
      "staged against the ledger. The returned id is claimed onto an entry by " +
      "passing it in the entry's `attachments` array at create/update time; " +
      "a staged id that is never claimed is simply never shown on any entry.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: uploadEntryAttachmentFormSchema,
          },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...payloadTooLargeResponse,
      ...unsupportedMediaTypeResponse,
      ...okResponseFn(
        uploadEntryAttachmentResponseSchema,
        "The staged attachment",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    // "guest" = any member, the same floor as posting an entry.
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    assertLedgerWritable(access.ledger);

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const file = c.req.valid("form").file;
    if (!(file instanceof File) || file.size === 0) {
      throw new HTTPException(400, { message: "No file provided" });
    }
    // recognizeScreenshot's precedent: oversize is 413 here, before the
    // storage layer's own (400) check.
    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      throw new HTTPException(413, { message: "File too large" });
    }
    if (!PHOTO_MEDIA_TYPES.has(file.type)) {
      throw new HTTPException(415, {
        message: `Unsupported image type: ${file.type || "unknown"} (expected image/jpeg, image/png, image/webp, or image/gif)`,
      });
    }

    const result = await createAttachment({
      file,
      visibility: "private",
      uploaderId: userId,
      bizType: JOURNAL_ENTRY_BIZ_TYPE,
      bizId: ledgerId,
    });
    return c.json({ attachmentId: result.attachmentId, url: result.url }, 200);
  },
});
