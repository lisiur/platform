"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { UploadTable } from "./components/upload-table";

export default function UploadsPage() {
  const t = useTranslations("Uploads");
  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <UploadTable />
    </ManagementPageShell>
  );
}
