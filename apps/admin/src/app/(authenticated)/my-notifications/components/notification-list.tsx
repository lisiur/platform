"use client";

import { NotificationList as SharedNotificationList } from "@repo/frontend";
import { appClient } from "@/lib/api";
import { notificationHooks } from "@/lib/notifications";

export function NotificationList() {
  return (
    <SharedNotificationList hooks={notificationHooks} appClient={appClient} />
  );
}
