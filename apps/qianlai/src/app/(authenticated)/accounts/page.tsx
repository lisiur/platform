"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { AccountsTable } from "./components/accounts-table";

export default function AccountsPage() {
  const t = useTranslations("Accounts");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <AccountsTable />
    </ManagementPageShell>
  );
}
