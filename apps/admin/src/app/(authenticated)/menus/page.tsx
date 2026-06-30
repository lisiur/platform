"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AppSelector } from "@/components/app-selector";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ApplicationMenuManagement } from "../applications/[id]/components/application-menu-management";

export default function MenusPage() {
  const t = useTranslations("Menus");
  const [appId, setAppId] = useState<string>();

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="mb-4 shrink-0">
        <AppSelector value={appId} onChange={setAppId} />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {appId ? (
          <ApplicationMenuManagement appId={appId} />
        ) : (
          <div className="flex h-full min-h-64 w-full items-center justify-center rounded-md border border-dashed text-muted-foreground">
            {t("selectApp")}
          </div>
        )}
      </div>
    </ManagementPageShell>
  );
}
