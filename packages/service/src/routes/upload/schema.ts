import { z } from "@hono/zod-openapi";

export const uploadItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    path: z.string().openapi({ example: "public/a3/b7/a3b7c9d0.jpg" }),
    mimeType: z.string().openapi({ example: "image/jpeg" }),
    size: z.number().openapi({ example: 102400 }),
    visibility: z.string().openapi({ example: "public" }),
    uploaderId: z.string().openapi({ example: "clx1234567890" }),
    createdAt: z.date(),
  })
  .openapi("Upload");

export const uploadResponseSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    url: z.string().openapi({ example: "/api/files/clx1234567890" }),
  })
  .openapi("UploadResponse");

export const signedUrlResponseSchema = z
  .object({
    url: z.string().openapi({
      example: "/api/upload/clx1234567890?token=abc123&expires=1716000000000",
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

export const uploadBodySchema = z.object({
  visibility: z.enum(["public", "private"]).default("private"),
});

export const getFileParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const getFileQuerySchema = z.object({
  token: z.string().optional(),
  expires: z.string().optional(),
});

export const signFileParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const uploaderSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Alice" }),
    email: z.email().openapi({ example: "alice@example.com" }),
  })
  .openapi("Uploader");

export const uploadListItemSchema = uploadItemSchema
  .extend({
    uploader: uploaderSchema,
  })
  .openapi("UploadListItem");

export const listUploadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  visibility: z.enum(["public", "private"]).optional(),
  mimeType: z.string().optional(),
  uploader: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const listUploadsResponseSchema = z
  .object({
    uploads: uploadListItemSchema.array(),
    total: z.number(),
  })
  .openapi("ListUploadsResponse");

export const deleteUploadsBodySchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .openapi({ example: ["clx1234567890"] }),
});

export const replaceUploadParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export type UploadItem = z.infer<typeof uploadItemSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;
export type UploadListItem = z.infer<typeof uploadListItemSchema>;
