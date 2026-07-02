"use client";

import { DataTablePagination } from "@repo/frontend";
import { Button, ButtonGroup, Spinner } from "@repo/ui";
import { Check, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { NotificationItem } from "@/components/notification-item";
import {
  type UserNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";

function NotificationItems({ unreadOnly }: { unreadOnly: boolean }) {
  const t = useTranslations("Notifications");
  const markRead = useMarkNotificationRead();

  const { items, total, page, pageSize, loading, setPage } =
    usePaginatedQuery<UserNotification>({
      queryKey: ["notifications", "list", { unreadOnly }],
      queryFn: async ({ limit, offset }) => {
        const res = await appClient.api.notifications.$get({
          query: { limit, offset, unreadOnly },
        });
        if (!res.ok) throw new Error("Failed to load notifications");
        const data = await res.json();
        return { items: data.notifications, total: data.total };
      },
    });

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
        {unreadOnly ? t("empty") : t("noNotifications")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="divide-y overflow-hidden rounded-md border">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            className="bg-background px-4 py-3"
            trailing={
              notification.readAt === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(notification.id)}
                >
                  <Check />
                  <span className="sr-only">{t("markRead")}</span>
                </Button>
              ) : null
            }
          />
        ))}
      </div>

      {total > pageSize && (
        <DataTablePagination
          className="mt-4 shrink-0"
          page={page}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function NotificationList() {
  const t = useTranslations("Notifications");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data: count } = useUnreadNotificationCount();
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = count ?? 0;

  async function handleMarkAllRead() {
    try {
      await markAllRead.mutateAsync();
      toast.success(t("markAllReadSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
        <ButtonGroup>
          <Button
            size="sm"
            variant={unreadOnly ? "ghost" : "secondary"}
            onClick={() => setUnreadOnly(false)}
          >
            {t("all")}
          </Button>
          <Button
            size="sm"
            variant={unreadOnly ? "secondary" : "ghost"}
            onClick={() => setUnreadOnly(true)}
          >
            {t("unread")}
          </Button>
        </ButtonGroup>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={markAllRead.isPending}
            onClick={() => void handleMarkAllRead()}
          >
            <CheckCheck />
            {t("markAllRead")}
          </Button>
        )}
      </div>
      <NotificationItems key={String(unreadOnly)} unreadOnly={unreadOnly} />
    </div>
  );
}
