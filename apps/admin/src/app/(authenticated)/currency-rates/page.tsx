"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { CurrencyRateTable } from "./components/currency-rate-table";

export default function CurrencyRatesPage() {
  const t = useTranslations("CurrencyRates");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex min-h-0 flex-1 flex-col">
        <CurrencyRateTable />
      </div>
    </ManagementPageShell>
  );
}
