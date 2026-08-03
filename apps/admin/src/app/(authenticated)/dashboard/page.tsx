"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { useSession } from "@/lib/api";
import { DashboardOverview } from "./components/dashboard-overview";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const { data: session } = useSession();

  return (
    <ManagementPageShell
      title={t("welcome", { name: session?.user.name ?? "" })}
      description={t("welcomeDescription")}
    >
      <DashboardOverview />
    </ManagementPageShell>
  );
}
