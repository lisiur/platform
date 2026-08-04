"use client";

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "@repo/ui";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { toast } from "../lib/toast";
import type { NotificationHooks } from "../notifications/create-notification-hooks";
import { NotificationItem } from "./notification-item";

interface NotificationBellProps {
  hooks: NotificationHooks;
  viewAllHref: string;
  viewAllLink?: ReactElement;
  enabled?: boolean;
}

export function NotificationBell({
  hooks,
  viewAllHref,
  viewAllLink,
  enabled = true,
}: NotificationBellProps) {
  const t = useTranslations("Frontend.userNotifications");
  const [open, setOpen] = useState(false);
  const { data: count } = hooks.useUnreadNotificationCount(enabled);
  const { data: recent, isLoading } = hooks.useRecentNotifications(
    open && enabled,
  );
  const markRead = hooks.useMarkNotificationRead();
  const markAllRead = hooks.useMarkAllNotificationsRead();
  const skeletonIds = useRef(
    Array.from({ length: 3 }, () => crypto.randomUUID()),
  );

  if (!enabled) return null;

  const unreadCount = count ?? 0;

  async function handleMarkAllRead() {
    try {
      await markAllRead.mutateAsync();
      toast.success(t("markAllReadSuccess"));
    } catch {
      // Error handled by withApiFeedback.
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-destructive-foreground text-[10px] font-medium">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <span className="sr-only">{t("title")}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-80 gap-0 p-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <p className="font-semibold text-sm">{t("title")}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => void handleMarkAllRead()}
          >
            <CheckCheck />
            {t("markAllRead")}
          </Button>
        </div>

        <div className="max-h-96 shrink-0 overflow-y-auto py-1">
          {isLoading ? (
            <div className="space-y-1 px-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton
                  key={skeletonIds.current[i]}
                  className="h-12 w-full"
                />
              ))}
            </div>
          ) : !recent || recent.length === 0 ? (
            <p className="px-3 py-8 text-center text-muted-foreground text-sm">
              {t("empty")}
            </p>
          ) : (
            recent.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                className="px-3"
                onClick={
                  notification.readAt === null
                    ? (n) => void markRead.mutate(n.id)
                    : undefined
                }
              />
            ))
          )}
        </div>

        <div className="shrink-0 border-t">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="w-full rounded-none"
            render={
              viewAllLink ?? (
                <a href={viewAllHref}>
                  <span className="sr-only">{t("viewAll")}</span>
                </a>
              )
            }
            onClick={() => setOpen(false)}
          >
            {t("viewAll")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type { NotificationBellProps };
