"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationChannelTable } from "./components/notification-channel-table";
import { NotificationTemplateTable } from "./components/notification-template-table";

export default function NotificationsPage() {
  const t = useTranslations("Notifications");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <Tabs defaultValue="templates" className="min-h-0 flex-1 overflow-hidden">
        <TabsList className="mb-4 shrink-0">
          <TabsTrigger value="templates">{t("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="channels">{t("tabs.channels")}</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="flex min-h-0 overflow-hidden">
          <NotificationTemplateTable />
        </TabsContent>
        <TabsContent value="channels" className="flex min-h-0 overflow-hidden">
          <NotificationChannelTable />
        </TabsContent>
      </Tabs>
    </ManagementPageShell>
  );
}
