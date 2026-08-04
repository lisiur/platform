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
import { FlaskConical, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { getChannelIcon } from "./channel-icon";
import { NotificationTemplateDialog } from "./notification-template-dialog";
import { NotificationTestDialog } from "./notification-test-dialog";
import type { NotificationChannel, NotificationTemplate } from "./types";

export function NotificationTemplateTable() {
  const t = useTranslations("Notifications");
  const queryClient = useQueryClient();
  const [editTemplate, setEditTemplate] = useState<NotificationTemplate | null>(
    null,
  );
  const [testTemplate, setTestTemplate] = useState<NotificationTemplate | null>(
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
      )();
      const data = await res.json();
      return data.channels;
    },
  });

  const templates = (templatesQuery.data ?? []) as NotificationTemplate[];
  const channels = (channelsQuery.data ?? []) as NotificationChannel[];
  const loading = templatesQuery.isFetching || channelsQuery.isFetching;

  function refreshTemplates() {
    void queryClient.invalidateQueries({
      queryKey: ["notification-templates"],
    });
  }

  function handleEditSuccess() {
    setEditTemplate(null);
    refreshTemplates();
    toast.success(t("templates.updateSuccess"));
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
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    {getChannelIcon(template.channel?.providerKey)}
                    {template.name}
                  </span>
                </TableCell>
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
                <TableActionCell
                  menuLabel={t("fields.actions")}
                  menu={
                    <>
                      <DropdownMenuItem
                        onClick={() => setEditTemplate(template)}
                      >
                        <Pencil />
                        {t("actions.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setTestTemplate(template)}
                      >
                        <FlaskConical />
                        {t("actions.test")}
                      </DropdownMenuItem>
                    </>
                  }
                >
                  <ButtonGroup className="ml-auto">
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("actions.edit")}
                      tooltip={t("actions.edit")}
                      onClick={() => setEditTemplate(template)}
                    >
                      <Pencil />
                    </TooltipButton>
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("actions.test")}
                      tooltip={t("actions.test")}
                      onClick={() => setTestTemplate(template)}
                    >
                      <FlaskConical />
                    </TooltipButton>
                  </ButtonGroup>
                </TableActionCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
      {testTemplate && (
        <NotificationTestDialog
          template={testTemplate}
          open={!!testTemplate}
          onOpenChange={(open) => !open && setTestTemplate(null)}
        />
      )}
    </div>
  );
}
