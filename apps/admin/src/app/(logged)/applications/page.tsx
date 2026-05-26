"use client";

import { useTranslations } from "next-intl";
import { AppTable } from "./components/app-table";

export default function ApplicationsPage() {
  const t = useTranslations("Applications");

  return (
    <div className="container mx-auto flex h-full min-h-0 flex-col overflow-hidden py-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <AppTable />
    </div>
  );
}
