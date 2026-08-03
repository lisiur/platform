"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { TokenTable } from "./components/token-table";

export default function TokensPage() {
  const t = useTranslations("Tokens");
  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <TokenTable />
    </ManagementPageShell>
  );
}
