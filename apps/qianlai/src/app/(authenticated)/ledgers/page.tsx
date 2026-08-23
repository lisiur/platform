"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { LedgersTable } from "./components/ledgers-table";

export default function LedgersPage() {
  const t = useTranslations("Ledgers");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <LedgersTable />
    </ManagementPageShell>
  );
}
