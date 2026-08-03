"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";

export default function ExamBuilderPage() {
  const t = useTranslations("ExamBuilder");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {t("placeholder")}
      </div>
    </ManagementPageShell>
  );
}
