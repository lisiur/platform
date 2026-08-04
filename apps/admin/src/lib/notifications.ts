"use client";

import { createNotificationHooks } from "@repo/frontend";
import { API_ORIGIN, APP_CODE, appClient, useSession } from "@/lib/api";

export const notificationHooks = createNotificationHooks({
  appClient,
  useSession,
  apiOrigin: API_ORIGIN,
  appCode: APP_CODE,
});

export const {
  useUnreadNotificationCount,
  useRecentNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} = notificationHooks;
