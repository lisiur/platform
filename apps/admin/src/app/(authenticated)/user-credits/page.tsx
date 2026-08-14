"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { UserCreditTable } from "./components/user-credit-table";

export default function UserCreditsPage() {
  const t = useTranslations("UserCredits");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <UserCreditTable />
      </div>
    </ManagementPageShell>
  );
}
