import { z } from "@hono/zod-openapi";

export {
  errorSchema,
  idParamSchema,
  paginationQuerySchema,
} from "#lib/openapi";

export const notificationSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    renderedTitle: z.string().nullable().openapi({ example: "Welcome!" }),
    renderedBody: z
      .string()
      .openapi({ example: "You have signed in successfully." }),
    readAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .openapi("Notification");

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z.coerce.boolean().optional().default(false),
});

export const listNotificationsResponseSchema = z
  .object({
    notifications: z.array(notificationSchema),
    total: z.number(),
  })
  .openapi("ListNotificationsResponse");

export const unreadCountResponseSchema = z
  .object({
    count: z.number(),
  })
  .openapi("UnreadCountResponse");
