"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { AppTable } from "./components/app-table";

export default function ApplicationsPage() {
  const t = useTranslations("Applications");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <AppTable />
    </ManagementPageShell>
  );
}
