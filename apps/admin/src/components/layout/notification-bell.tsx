"use client";

import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Spinner,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  useInvalidateNotificationCount,
  useNotificationCount,
} from "@/hooks/use-notification-count";
import { appClient } from "@/lib/api/app-client";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

type NotificationItem = {
  id: string;
  renderedTitle: string | null;
  renderedBody: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const t = useTranslations("NotificationBell");
  const [open, setOpen] = useState(false);
  const canViewNotifications = useHasPermission("system/notification:list");
  const { count } = useNotificationCount(canViewNotifications);
  const invalidateCount = useInvalidateNotificationCount();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["notifications-recent"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.notifications.$get)({
        query: { limit: 10, offset: 0 },
      });
      const data = await res.json();
      return data.notifications as NotificationItem[];
    },
    enabled: open && canViewNotifications,
  });

  if (!canViewNotifications) return null;

  const notifications = listQuery.data ?? [];

  async function handleMarkAllRead() {
    try {
      await withApiFeedback(appClient.api.notifications["read-all"].$patch)();
      invalidateCount();
      void queryClient.invalidateQueries({
        queryKey: ["notifications-recent"],
      });
    } catch {
      // handled by withApiFeedback
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await withApiFeedback(appClient.api.notifications[":id"].read.$patch)({
        param: { id },
      });
      invalidateCount();
      void queryClient.invalidateQueries({
        queryKey: ["notifications-recent"],
      });
    } catch {
      // handled by withApiFeedback
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-7 w-7">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-medium text-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">{t("title")}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">{t("title")}</span>
          {count > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>
        <Separator />
        <div className="max-h-80 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("noNotifications")}
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (!notification.readAt) handleMarkRead(notification.id);
                }}
                className={cn(
                  "flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-accent/50",
                  !notification.readAt && "bg-accent/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">
                    {notification.renderedTitle}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDate(notification.createdAt)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {notification.renderedBody}
                </span>
              </button>
            ))
          )}
        </div>
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="px-3 py-2">
              <Link
                href="/my-notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("viewAll")}
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
