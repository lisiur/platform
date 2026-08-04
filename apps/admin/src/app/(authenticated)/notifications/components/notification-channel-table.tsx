"use client";

import {
  Badge,
  ButtonGroup,
  DropdownMenuItem,
  Spinner,
  Table,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { getChannelIcon } from "./channel-icon";
import { NotificationChannelDialog } from "./notification-channel-dialog";
import type { NotificationChannel, NotificationProvider } from "./types";

export function NotificationChannelTable() {
  const t = useTranslations("Notifications");
  const queryClient = useQueryClient();
  const [editChannel, setEditChannel] = useState<NotificationChannel | null>(
    null,
  );

  const channelsQuery = useQuery({
    queryKey: ["notification-channels"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api["notification-channels"].$get,
      )();
      const data = await res.json();
      return data.channels;
    },
  });
  const providersQuery = useQuery({
    queryKey: ["notification-channel-providers"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api["notification-channels"].providers.$get,
      )();
      const data = await res.json();
      return data.providers;
    },
  });

  const channels = (channelsQuery.data ?? []) as NotificationChannel[];
  const providers = (providersQuery.data ?? []) as NotificationProvider[];
  const loading = channelsQuery.isFetching || providersQuery.isFetching;

  function refreshChannels() {
    void queryClient.invalidateQueries({
      queryKey: ["notification-channels"],
    });
  }

  function handleEditSuccess() {
    setEditChannel(null);
    refreshChannels();
    toast.success(t("channels.updateSuccess"));
  }

  function getProviderName(providerKey: string) {
    return (
      providers.find((provider) => provider.key === providerKey)?.name ??
      providerKey
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {channels.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed py-8 text-muted-foreground">
          {t("channels.empty")}
        </div>
      ) : (
        <Table containerClassName="min-h-0 min-w-0 overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("fields.name")}</TableHead>
              <TableHead>{t("fields.key")}</TableHead>
              <TableHead>{t("fields.provider")}</TableHead>
              <TableHead>{t("fields.status")}</TableHead>
              <TableHead>{t("fields.createdAt")}</TableHead>
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    {getChannelIcon(channel.providerKey)}
                    {channel.name}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {channel.key}
                </TableCell>
                <TableCell>{getProviderName(channel.providerKey)}</TableCell>
                <TableCell>
                  <Badge variant={channel.enabled ? "secondary" : "outline"}>
                    {channel.enabled
                      ? t("status.enabled")
                      : t("status.disabled")}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(channel.createdAt)}</TableCell>
                <TableActionCell
                  menuLabel={t("fields.actions")}
                  menu={
                    <DropdownMenuItem onClick={() => setEditChannel(channel)}>
                      <Pencil />
                      {t("actions.edit")}
                    </DropdownMenuItem>
                  }
                >
                  <ButtonGroup className="ml-auto">
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("actions.edit")}
                      tooltip={t("actions.edit")}
                      onClick={() => setEditChannel(channel)}
                    >
                      <Pencil />
                    </TooltipButton>
                  </ButtonGroup>
                </TableActionCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editChannel && (
        <NotificationChannelDialog
          channel={editChannel}
          providers={providers}
          open={!!editChannel}
          onOpenChange={(open) => !open && setEditChannel(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
