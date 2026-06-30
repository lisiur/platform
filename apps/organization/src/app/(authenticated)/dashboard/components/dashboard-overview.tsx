"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, Briefcase, Building2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { NotificationItem } from "@/components/notification-item";
import {
  useMarkNotificationRead,
  useRecentNotifications,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { appClient, useSession } from "@/lib/api";
import { StatCard } from "./stat-card";

export function DashboardOverview() {
  const t = useTranslations("Dashboard");
  const { data: session } = useSession();
  const orgId = session?.session.activeOrganizationId;
  const enabled = !!orgId;

  const membersQuery = useQuery({
    queryKey: ["dashboard", "members", orgId],
    enabled,
    queryFn: async () => {
      if (!orgId) return 0;
      const res = await appClient.api.organizations[":orgId"].members.$get({
        param: { orgId },
        query: { limit: 1, offset: 0 },
      });
      if (!res.ok) throw new Error("Failed to load members");
      const data = await res.json();
      return data.total;
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["dashboard", "departments", orgId],
    enabled,
    queryFn: async () => {
      if (!orgId) return 0;
      const res = await appClient.api.organizations[":orgId"].departments.$get({
        param: { orgId },
      });
      if (!res.ok) throw new Error("Failed to load departments");
      const data = await res.json();
      return data.departments.length;
    },
  });

  const positionsQuery = useQuery({
    queryKey: ["dashboard", "positions", orgId],
    enabled,
    retry: false,
    queryFn: async () => {
      if (!orgId) return 0;
      const res = await appClient.api.organizations[":orgId"].positions.$get({
        param: { orgId },
      });
      if (!res.ok) throw new Error("Failed to load positions");
      const data = await res.json();
      return data.positions.length;
    },
  });

  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: recent } = useRecentNotifications(enabled);
  const markRead = useMarkNotificationRead();

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <h2 className="font-semibold text-xl">
          {t("welcome", { name: session?.user.name ?? "" })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("welcomeDescription")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("statMembers")}
          value={membersQuery.data}
          href="/members"
        />
        <StatCard
          icon={Building2}
          label={t("statDepartments")}
          value={departmentsQuery.data}
          href="/departments"
        />
        {!positionsQuery.isError && (
          <StatCard
            icon={Briefcase}
            label={t("statPositions")}
            value={positionsQuery.data}
            href="/positions"
          />
        )}
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
