"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { SubscriptionTable } from "../pricing/components/subscription-table";

export default function SubscriptionsPage() {
  const t = useTranslations("Pricing");

  return (
    <ManagementPageShell
      title={t("subscriptions")}
      description={t("description")}
    >
      <div className="flex-1 overflow-y-auto">
        <SubscriptionTable />
      </div>
    </ManagementPageShell>
  );
}
