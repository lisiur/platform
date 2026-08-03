"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { NotificationList } from "./components/notification-list";

export default function NotificationsPage() {
  const t = useTranslations("Notifications");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <NotificationList />
    </ManagementPageShell>
  );
}
