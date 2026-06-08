import { z } from "@hono/zod-openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

const jsonValueSchema = z.unknown().nullable().optional();

export const notificationProviderSchema = z
  .object({
    key: z.string().openapi({ example: "smtp-email" }),
    name: z.string().openapi({ example: "SMTP Email" }),
    description: z.string(),
    configSchema: z.unknown().nullable(),
    secretFields: z.array(z.string()),
  })
  .openapi("NotificationProvider");

export const notificationChannelSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    key: z.string().openapi({ example: "primary-email" }),
    name: z.string().openapi({ example: "Primary Email" }),
    providerKey: z.string().openapi({ example: "smtp-email" }),
    enabled: z.boolean(),
    config: z.unknown().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z.date().nullable().optional(),
  })
  .openapi("NotificationChannel");

export const listNotificationChannelsQuerySchema = z.object({
  includeDeleted: z.coerce.boolean().optional(),
});

export const notificationChannelIdParamSchema = z.object({
  id: z.string().min(1),
});

export const createNotificationChannelBodySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  providerKey: z.string().min(1),
  enabled: z.boolean().optional(),
  config: jsonValueSchema,
});

export const updateNotificationChannelBodySchema = z.object({
  key: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  providerKey: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: jsonValueSchema,
});

export const listNotificationChannelsResponseSchema = z
  .object({ channels: z.array(notificationChannelSchema) })
  .openapi("ListNotificationChannelsResponse");

export const listNotificationProvidersResponseSchema = z
  .object({ providers: z.array(notificationProviderSchema) })
  .openapi("ListNotificationProvidersResponse");
