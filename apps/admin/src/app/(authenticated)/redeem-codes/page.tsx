"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { RedeemCodeTable } from "./components/redeem-code-table";

export default function RedeemCodesPage() {
  const t = useTranslations("RedeemCodes");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <RedeemCodeTable />
      </div>
    </ManagementPageShell>
  );
}
