"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ApplicationRoleManagement } from "../applications/[id]/components/application-role-management";

export default function RolesPage() {
  const t = useTranslations("Roles");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <ApplicationRoleManagement className="max-h-full" />
    </ManagementPageShell>
  );
}
