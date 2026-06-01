"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { UserTable } from "./components/user-table";

export default function UsersPage() {
  const t = useTranslations("Users");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <UserTable />
    </ManagementPageShell>
  );
}
