"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  cn,
  DropdownMenuItem,
  Spinner,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { Check, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePaginatedQuery } from "../hooks/use-paginated-query";
import { withApiFeedback } from "../lib/api-utils";
import { formatDateTime } from "../lib/date";
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
          <TableActionHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((notification) => {
          const unread = notification.readAt === null;
          const time = formatDateTime(notification.createdAt);

          return (
            <TableRow key={notification.id}>
              <TableCell className="min-w-80 max-w-0">
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
                  <p className="whitespace-nowrap text-muted-foreground text-xs">
                    {time}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={unread ? "secondary" : "outline"}>
                  {unread ? t("unread") : t("read")}
                </Badge>
              </TableCell>
              <TableActionCell
                menuLabel={t("markRead")}
                menu={
                  unread ? (
                    <DropdownMenuItem
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      <Check />
                      {t("markRead")}
                    </DropdownMenuItem>
                  ) : undefined
                }
              >
                <ButtonGroup className="ml-auto">
                  {unread ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("markRead")}
                            disabled={markRead.isPending}
                            onClick={() => markRead.mutate(notification.id)}
                          >
                            <Check />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("markRead")}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </ButtonGroup>
              </TableActionCell>
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
