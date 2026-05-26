"use client";

import { useTranslations } from "next-intl";
import { LogTable } from "./components/log-table";

export default function LogsPage() {
  const t = useTranslations("Logs");

  return (
    <div className="container mx-auto flex h-full min-h-0 flex-col overflow-hidden py-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <LogTable />
    </div>
  );
}
