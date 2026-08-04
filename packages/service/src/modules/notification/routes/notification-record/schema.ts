import { z } from "@hono/zod-openapi";

export { errorSchema, idParamSchema } from "#lib/openapi";

const nullableDateSchema = z.date().nullable().optional();

export const notificationStatusSchema = z
  .enum(["PENDING", "SENT", "FAILED"])
  .openapi({ example: "SENT" });

export const notificationRecordRecipientSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Alice" }),
    email: z.email().openapi({ example: "alice@example.com" }),
  })
  .openapi("NotificationRecordRecipient");

export const notificationRecordTemplateSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    key: z.string().openapi({ example: "welcome" }),
    name: z.string().openapi({ example: "Welcome" }),
  })
  .openapi("NotificationRecordTemplate");

export const notificationRecordChannelSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    key: z.string().openapi({ example: "in-app" }),
    name: z.string().openapi({ example: "In-App" }),
    providerKey: z.string().openapi({ example: "in-app" }),
  })
  .openapi("NotificationRecordChannel");

export const notificationRecordAppSchema = z
  .object({
    code: z.string().openapi({ example: "organization" }),
    name: z.string().openapi({ example: "Organization" }),
  })
  .openapi("NotificationRecordApp");

export const notificationRecordSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    correlationId: z.string().openapi({ example: "018fc9c2-7a7e-4b7b" }),
    templateId: z.string().openapi({ example: "clx1234567890" }),
    channelId: z.string().openapi({ example: "clx1234567890" }),
    recipientUserId: z.string().openapi({ example: "clx1234567890" }),
    creatorId: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    variables: z.unknown().nullable().optional(),
    renderedSubject: z.string().nullable().optional(),
    renderedTitle: z.string().nullable().optional(),
    renderedBody: z.string().openapi({ example: "Welcome, Alice!" }),
    status: notificationStatusSchema,
    app: notificationRecordAppSchema.nullable().optional(),
    attempts: z.number().openapi({ example: 0 }),
    nextAttemptAt: nullableDateSchema,
    sentAt: nullableDateSchema,
    failedAt: nullableDateSchema,
    readAt: nullableDateSchema,
    archivedAt: nullableDateSchema,
    providerMessageId: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    metadata: z.unknown().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    recipient: notificationRecordRecipientSchema,
    template: notificationRecordTemplateSchema,
    channel: notificationRecordChannelSchema,
  })
  .openapi("NotificationRecord");

export const notificationRecordListItemSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    renderedSubject: z.string().nullable().optional(),
    renderedTitle: z.string().nullable().optional(),
    status: notificationStatusSchema,
    app: notificationRecordAppSchema.nullable().optional(),
    readAt: nullableDateSchema,
    archivedAt: nullableDateSchema,
    createdAt: z.date(),
    recipient: notificationRecordRecipientSchema,
    template: notificationRecordTemplateSchema,
    channel: notificationRecordChannelSchema,
  })
  .openapi("NotificationRecordListItem");

export const listNotificationRecordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  recipientUserId: z.string().optional(),
  recipientEmail: z.string().optional(),
  recipientName: z.string().optional(),
  templateId: z.string().optional(),
  templateKey: z.string().optional(),
  channelId: z.string().optional(),
  providerKey: z.string().optional(),
  status: notificationStatusSchema.optional(),
  readState: z.enum(["all", "read", "unread"]).optional().default("all"),
  archivedState: z
    .enum(["all", "active", "archived"])
    .optional()
    .default("active"),
  source: z.string().optional(),
  correlationId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const listNotificationRecordsResponseSchema = z
  .object({
    records: z.array(notificationRecordListItemSchema),
    total: z.number(),
  })
  .openapi("ListNotificationRecordsResponse");
