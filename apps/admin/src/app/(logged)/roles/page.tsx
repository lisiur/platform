"use client";

import { useTranslations } from "next-intl";
import { RoleTable } from "./components/role-table";

export default function RolesPage() {
  const t = useTranslations("Roles");

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <RoleTable />
    </div>
  );
}
