"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { FeatureTable } from "../pricing/components/feature-table";

export default function FeaturesPage() {
  const t = useTranslations("Pricing");

  return (
    <ManagementPageShell title={t("features")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <FeatureTable />
      </div>
    </ManagementPageShell>
  );
}
