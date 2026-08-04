"use client";

import { NotificationBell as SharedNotificationBell } from "@repo/frontend";
import Link from "next/link";
import { notificationHooks } from "@/lib/notifications";

export function NotificationBell() {
  return (
    <SharedNotificationBell
      hooks={notificationHooks}
      viewAllHref="/notifications"
      viewAllLink={<Link href="/notifications" />}
    />
  );
}
