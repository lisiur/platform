"use client";

import { isBuiltinNotification } from "@repo/shared";
import {
  Badge,
  Button,
  ButtonGroup,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { getChannelIcon } from "./channel-icon";
import { NotificationChannelDialog } from "./notification-channel-dialog";
import type { NotificationChannel, NotificationProvider } from "./types";

export function NotificationChannelTable() {
  const t = useTranslations("Notifications");
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editChannel, setEditChannel] = useState<NotificationChannel | null>(
    null,
  );

  const channelsQuery = useQuery({
    queryKey: ["notification-channels"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api["notification-channels"].$get,
      )({ query: {} });
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

  function getProviderName(providerKey: string) {
    return (
      providers.find((provider) => provider.key === providerKey)?.name ??
      providerKey
    );
  }

  function handleCreateSuccess() {
    setShowCreate(false);
    refreshChannels();
    toast.success(t("channels.createSuccess"));
  }

  function handleEditSuccess() {
    setEditChannel(null);
    refreshChannels();
    toast.success(t("channels.updateSuccess"));
  }

  async function handleDelete(channel: NotificationChannel) {
    const confirmed = await confirm({
      title: t("channels.delete"),
      description: (
        <>
          {t("channels.confirmDelete")} <strong>{channel.name}</strong>?
        </>
      ),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(
        appClient.api["notification-channels"][":id"].$delete,
      )({
        param: { id: channel.id },
      });
      refreshChannels();
      toast.success(t("channels.deleteSuccess"));
    } catch {
      // Error handled by API feedback.
    }
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
      <div className="mb-4 flex shrink-0 justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t("channels.create")}
        </Button>
      </div>
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
              <TableHead sticky="right" align="right">
                {t("fields.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => {
              const builtin = isBuiltinNotification(channel.flags);
              return (
                <TableRow key={channel.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      {getChannelIcon(channel.providerKey)}
                      {channel.name}
                      {builtin && (
                        <Badge
                          variant="secondary"
                          className="px-1.5"
                          title={t("channels.protectedActionDisabled")}
                          aria-label={t("channels.protected")}
                        >
                          <Shield className="h-3 w-3" />
                        </Badge>
                      )}
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
                  <TableCell sticky="right" align="right">
                    <ButtonGroup className="ml-auto">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("actions.edit")}
                              onClick={() => setEditChannel(channel)}
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("actions.edit")}</TooltipContent>
                      </Tooltip>
                      {builtin ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled
                          title={t("channels.protectedActionDisabled")}
                          aria-label={t("actions.delete")}
                        >
                          <Trash2 />
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("actions.delete")}
                                onClick={() => handleDelete(channel)}
                              >
                                <Trash2 />
                              </Button>
                            }
                          />
                          <TooltipContent>{t("actions.delete")}</TooltipContent>
                        </Tooltip>
                      )}
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {showCreate && (
        <NotificationChannelDialog
          providers={providers}
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
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
