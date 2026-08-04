import { z } from "@hono/zod-openapi";
import { notificationChannelSchema } from "#modules/notification/routes/notification-channel/schema";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

const jsonValueSchema = z.unknown().nullable().optional();

export const notificationTemplateSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    key: z.string().openapi({ example: "user-welcome.email" }),
    channelId: z.string().openapi({ example: "clx1234567890" }),
    channel: notificationChannelSchema,
    name: z.string().openapi({ example: "Welcome Email" }),
    description: z.string().nullable().optional(),
    enabled: z.boolean(),
    subjectTemplate: z.string().nullable().optional(),
    titleTemplate: z.string().nullable().optional(),
    bodyTemplate: z.string(),
    variablesSchema: z.unknown().nullable().optional(),
    sampleVariables: z.unknown().nullable().optional(),
    flags: z.array(z.string()).default([]),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("NotificationTemplate");

export const listNotificationTemplatesQuerySchema = z.object({
  channelId: z.string().optional(),
});

export const notificationTemplateIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updateNotificationTemplateBodySchema = z.object({
  key: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  subjectTemplate: z.string().nullable().optional(),
  titleTemplate: z.string().nullable().optional(),
  bodyTemplate: z.string().min(1).optional(),
  variablesSchema: jsonValueSchema,
  sampleVariables: jsonValueSchema,
});

export const listNotificationTemplatesResponseSchema = z
  .object({ templates: z.array(notificationTemplateSchema) })
  .openapi("ListNotificationTemplatesResponse");

export const sendTestNotificationBodySchema = z.object({
  recipientUserId: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export const sendTestNotificationResponseSchema = z
  .object({
    correlationId: z.string(),
    total: z.number(),
    pending: z.number(),
    failed: z.number(),
    notificationIds: z.array(z.string()),
  })
  .openapi("SendTestNotificationResponse");
