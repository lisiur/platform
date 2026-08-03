"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { NotificationItem } from "@/components/notification-item";
import {
  useMarkNotificationRead,
  useRecentNotifications,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { useSession } from "@/lib/api";
import { StatCard } from "./stat-card";

export function DashboardOverview() {
  const t = useTranslations("Dashboard");
  const { data: session } = useSession();
  const orgId = session?.session.activeOrganizationId;
  const enabled = !!orgId;

  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: recent } = useRecentNotifications(enabled);
  const markRead = useMarkNotificationRead();

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Bell}
          label={t("statUnread")}
          value={unreadCount}
          href="/notifications"
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{t("recentActivity")}</h3>
          <Link
            href="/notifications"
            className="text-primary text-sm hover:underline"
          >
            {t("viewAll")}
          </Link>
        </div>
        <div className="rounded-lg border">
          {!recent || recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">
              {t("noRecentActivity")}
            </p>
          ) : (
            <div className="divide-y">
              {recent.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  className="px-4"
                  onClick={
                    notification.readAt === null
                      ? (n) => void markRead.mutate(n.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
