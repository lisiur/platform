"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { PlanTable } from "./components/plan-table";

export default function PricingPage() {
  const t = useTranslations("Pricing");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <PlanTable />
      </div>
    </ManagementPageShell>
  );
}
