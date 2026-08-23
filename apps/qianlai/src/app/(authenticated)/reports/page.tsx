"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ReportsView } from "./components/reports-view";

export default function ReportsPage() {
  const t = useTranslations("Reports");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <ReportsView />
    </ManagementPageShell>
  );
}
