"use client";

import { NotificationBell as SharedNotificationBell } from "@repo/frontend";
import Link from "next/link";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { notificationHooks } from "@/lib/notifications";

export function NotificationBell() {
  const canViewNotifications = useHasPermission("system/notification:list");
  return (
    <SharedNotificationBell
      hooks={notificationHooks}
      viewAllHref="/my-notifications"
      viewAllLink={<Link href="/my-notifications" />}
      enabled={canViewNotifications}
    />
  );
}
