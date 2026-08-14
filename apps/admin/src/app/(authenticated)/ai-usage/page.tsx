"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { AiUsageTable } from "./components/ai-usage-table";

export default function AiUsagePage() {
  const t = useTranslations("AiUsage");
  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <AiUsageTable />
    </ManagementPageShell>
  );
}
