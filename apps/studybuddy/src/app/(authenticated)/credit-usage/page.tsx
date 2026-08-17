"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { CreditUsageOverview } from "./components/credit-usage-overview";

export default function CreditUsagePage() {
  const t = useTranslations("CreditUsage");
  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <CreditUsageOverview />
    </ManagementPageShell>
  );
}
