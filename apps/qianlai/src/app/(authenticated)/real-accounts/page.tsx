"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { RealAccountsView } from "./components/real-accounts-view";

export default function RealAccountsPage() {
  const t = useTranslations("RealAccounts");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <RealAccountsView />
    </ManagementPageShell>
  );
}
