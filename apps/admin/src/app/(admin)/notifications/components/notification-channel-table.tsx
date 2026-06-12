"use client";

import {
  Badge,
  Button,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
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
  const loading = channelsQuery.isLoading || providersQuery.isLoading;

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
          <Plus className="mr-2 h-4 w-4" />
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
            {channels.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell>{channel.name}</TableCell>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditChannel(channel)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(channel)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
