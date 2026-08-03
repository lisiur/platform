"use client";

import { cn } from "@repo/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { UserNotification } from "@/hooks/use-notifications";
import { formatRelativeTime } from "@/utils/date";

interface NotificationItemProps {
  notification: UserNotification;
  onClick?: (notification: UserNotification) => void;
  trailing?: ReactNode;
  className?: string;
}

export function NotificationItem({
  notification,
  onClick,
  trailing,
  className,
}: NotificationItemProps) {
  const t = useTranslations("Notifications");
  const unread = notification.readAt === null;
  const relative = formatRelativeTime(notification.createdAt);
  const time = relative ?? t("justNow");

  const content = (
    <>
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold" : "font-medium text-muted-foreground",
            )}
          >
            {notification.renderedTitle || notification.renderedBody}
          </p>
          <span className="shrink-0 text-muted-foreground text-xs">{time}</span>
        </div>
        {notification.renderedTitle && (
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {notification.renderedBody}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0 self-center">{trailing}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        onClick={() => onClick(notification)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cn("flex items-start gap-3 rounded-md p-2", className)}>
      {content}
    </div>
  );
}
