import { z } from "@hono/zod-openapi";

export const attachmentSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    bizType: z.string().openapi({ example: "user:avatar" }),
    bizId: z.string().openapi({ example: "clx1234567890" }),
    visibility: z.string().openapi({ example: "public" }),
    createdAt: z.date(),
  })
  .openapi("Attachment");

export const uploadSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    path: z.string().openapi({ example: "public/a3/b7/a3b7c9d0.jpg" }),
    mimeType: z.string().openapi({ example: "image/jpeg" }),
    size: z.number().openapi({ example: 102400 }),
    hash: z.string().openapi({ example: "abc123def456..." }),
  })
  .openapi("Upload");

export const createAttachmentResponseSchema = z
  .object({
    attachmentId: z.string().openapi({ example: "clx1234567890" }),
    uploadId: z.string().openapi({ example: "clx1234567890" }),
    url: z.string().openapi({ example: "/api/attachment/clx1234567890" }),
  })
  .openapi("CreateAttachmentResponse");

export const signedUrlResponseSchema = z
  .object({
    url: z.string().openapi({
      example:
        "/api/attachment/clx1234567890?token=abc123&expires=1716000000000",
    }),
    expiresAt: z.date(),
  })
  .openapi("SignedUrlResponse");

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");

export const createAttachmentBodySchema = z.object({
  visibility: z.enum(["public", "private"]).default("private"),
});

export const getAttachmentParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const getAttachmentQuerySchema = z.object({
  token: z.string().optional(),
  expires: z.string().optional(),
});

export const signAttachmentParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const attachmentListItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    bizType: z.string().openapi({ example: "user:avatar" }),
    bizId: z.string().openapi({ example: "clx1234567890" }),
    visibility: z.string().openapi({ example: "public" }),
    createdBy: z.string().openapi({ example: "clx1234567890" }),
    createdAt: z.date(),
    upload: uploadSchema,
  })
  .openapi("AttachmentListItem");

export const listAttachmentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  visibility: z.enum(["public", "private"]).optional(),
  mimeType: z.string().optional(),
  uploader: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const listAttachmentsResponseSchema = z
  .object({
    attachments: attachmentListItemSchema.array(),
    total: z.number(),
  })
  .openapi("ListAttachmentsResponse");

export const deleteAttachmentsBodySchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .openapi({ example: ["clx1234567890"] }),
});

export const replaceAttachmentParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const replaceAttachmentResponseSchema = z
  .object({
    attachmentId: z.string().openapi({ example: "clx1234567890" }),
    uploadId: z.string().openapi({ example: "clx1234567890" }),
  })
  .openapi("ReplaceAttachmentResponse");

export type Attachment = z.infer<typeof attachmentSchema>;
export type CreateAttachmentResponse = z.infer<
  typeof createAttachmentResponseSchema
>;
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;
export type AttachmentListItem = z.infer<typeof attachmentListItemSchema>;
export type ReplaceAttachmentResponse = z.infer<
  typeof replaceAttachmentResponseSchema
>;
