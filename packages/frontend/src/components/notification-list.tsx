"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  cn,
  Spinner,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { Check, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePaginatedQuery } from "../hooks/use-paginated-query";
import { withApiFeedback } from "../lib/api-utils";
import { formatRelativeTime } from "../lib/date";
import { toast } from "../lib/toast";
import type {
  ListNotificationsResult,
  NotificationAppClient,
  NotificationHooks,
} from "../notifications/create-notification-hooks";
import type { UserNotification } from "../notifications/types";
import { PaginatedTableFrame } from "./paginated-table-frame";

interface NotificationListProps {
  hooks: NotificationHooks;
  appClient: NotificationAppClient;
}

function NotificationItems({
  hooks,
  appClient,
  unreadOnly,
}: NotificationListProps & { unreadOnly: boolean }) {
  const t = useTranslations("Frontend.userNotifications");
  const markRead = hooks.useMarkNotificationRead();

  const { items, total, page, pageSize, loading, setPage } =
    usePaginatedQuery<UserNotification>({
      queryKey: ["notifications", "list", { unreadOnly }],
      queryFn: async ({ limit, offset }) => {
        const query: { limit: number; offset: number; unreadOnly?: boolean } = {
          limit,
          offset,
        };
        if (unreadOnly) query.unreadOnly = true;

        const res = await withApiFeedback(appClient.api.notifications.$get, {
          showError: false,
        })({ query });
        const data = (await res.json()) as ListNotificationsResult;
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

  return (
    <PaginatedTableFrame
      loading={loading}
      empty={items.length === 0}
      emptyMessage={unreadOnly ? t("empty") : t("noNotifications")}
      page={page}
      total={total}
      pageSize={pageSize}
      onPageChange={setPage}
    >
      <TableHeader sticky>
        <TableRow>
          <TableHead>{t("columns.notification")}</TableHead>
          <TableHead className="w-32">{t("columns.status")}</TableHead>
          <TableHead className="w-36">{t("columns.createdAt")}</TableHead>
          <TableHead sticky="right" align="right" className="w-24">
            {t("columns.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((notification) => {
          const unread = notification.readAt === null;
          const relative = formatRelativeTime(notification.createdAt);
          const time = relative ?? t("justNow");

          return (
            <TableRow key={notification.id}>
              <TableCell className="min-w-80 max-w-0">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      unread ? "bg-primary" : "bg-transparent",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    <p
                      className={cn(
                        "truncate text-sm",
                        unread
                          ? "font-semibold"
                          : "font-medium text-muted-foreground",
                      )}
                    >
                      {notification.renderedTitle || notification.renderedBody}
                    </p>
                    {notification.renderedTitle && (
                      <p className="line-clamp-2 text-muted-foreground text-xs">
                        {notification.renderedBody}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={unread ? "secondary" : "outline"}>
                  {unread ? t("unread") : t("read")}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                {time}
              </TableCell>
              <TableCell sticky="right" align="right">
                {unread ? (
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
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </PaginatedTableFrame>
  );
}

export function NotificationList({ hooks, appClient }: NotificationListProps) {
  const t = useTranslations("Frontend.userNotifications");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data: count } = hooks.useUnreadNotificationCount();
  const markAllRead = hooks.useMarkAllNotificationsRead();
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
      <NotificationItems
        key={String(unreadOnly)}
        hooks={hooks}
        appClient={appClient}
        unreadOnly={unreadOnly}
      />
    </div>
  );
}

export type { NotificationListProps };
