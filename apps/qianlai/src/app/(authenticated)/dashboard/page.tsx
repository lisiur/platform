"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { DashboardOverview } from "./components/dashboard-overview";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <DashboardOverview />
    </ManagementPageShell>
  );
}
