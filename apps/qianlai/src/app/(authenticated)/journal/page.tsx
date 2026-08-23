"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { JournalTable } from "./components/journal-table";

export default function JournalPage() {
  const t = useTranslations("Journal");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <JournalTable />
    </ManagementPageShell>
  );
}
