"use client";

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
import { NotificationTemplateDialog } from "./notification-template-dialog";
import type { NotificationChannel, NotificationTemplate } from "./types";

export function NotificationTemplateTable() {
  const t = useTranslations("Notifications");
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<NotificationTemplate | null>(
    null,
  );

  const templatesQuery = useQuery({
    queryKey: ["notification-templates"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api["notification-templates"].$get,
      )({ query: {} });
      const data = await res.json();
      return data.templates;
    },
  });
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

  const templates = (templatesQuery.data ?? []) as NotificationTemplate[];
  const channels = (channelsQuery.data ?? []) as NotificationChannel[];
  const loading = templatesQuery.isLoading || channelsQuery.isLoading;

  function refreshTemplates() {
    void queryClient.invalidateQueries({
      queryKey: ["notification-templates"],
    });
  }

  function handleCreateSuccess() {
    setShowCreate(false);
    refreshTemplates();
    toast.success(t("templates.createSuccess"));
  }

  function handleEditSuccess() {
    setEditTemplate(null);
    refreshTemplates();
    toast.success(t("templates.updateSuccess"));
  }

  async function handleDelete(template: NotificationTemplate) {
    const confirmed = await confirm({
      title: t("templates.delete"),
      description: (
        <>
          {t("templates.confirmDelete")} <strong>{template.name}</strong>?
        </>
      ),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(
        appClient.api["notification-templates"][":id"].$delete,
      )({
        param: { id: template.id },
      });
      refreshTemplates();
      toast.success(t("templates.deleteSuccess"));
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
        <Button
          onClick={() => setShowCreate(true)}
          disabled={channels.length === 0}
        >
          <Plus className="h-4 w-4" />
          {t("templates.create")}
        </Button>
      </div>
      {templates.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed py-8 text-muted-foreground">
          {channels.length === 0
            ? t("templates.noChannels")
            : t("templates.empty")}
        </div>
      ) : (
        <Table containerClassName="min-h-0 min-w-0 overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("fields.name")}</TableHead>
              <TableHead>{t("fields.key")}</TableHead>
              <TableHead>{t("fields.channel")}</TableHead>
              <TableHead>{t("fields.status")}</TableHead>
              <TableHead>{t("fields.createdAt")}</TableHead>
              <TableHead sticky="right" align="right">
                {t("fields.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>{template.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {template.key}
                </TableCell>
                <TableCell>
                  {template.channel?.name ?? template.channelId}
                  <span className="ml-1 text-muted-foreground text-xs">
                    ({template.channel?.providerKey})
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={template.enabled ? "secondary" : "outline"}>
                    {template.enabled
                      ? t("status.enabled")
                      : t("status.disabled")}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(template.createdAt)}</TableCell>
                <TableCell sticky="right" align="right">
                  <ButtonGroup className="ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditTemplate(template)}
                    >
                      <Pencil />
                      {t("actions.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(template)}
                    >
                      <Trash2 />
                      {t("actions.delete")}
                    </Button>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showCreate && (
        <NotificationTemplateDialog
          channels={channels}
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
      {editTemplate && (
        <NotificationTemplateDialog
          template={editTemplate}
          channels={channels}
          open={!!editTemplate}
          onOpenChange={(open) => !open && setEditTemplate(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
