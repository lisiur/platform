"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { OrganizationTable } from "./components/organization-table";

export default function OrganizationsPage() {
  const t = useTranslations("Organizations");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <OrganizationTable />
    </ManagementPageShell>
  );
}
