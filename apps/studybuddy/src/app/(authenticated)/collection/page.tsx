"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { CollectionList } from "./components/collection-list";

export default function CollectionPage() {
  const t = useTranslations("Collection");
  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <CollectionList />
    </ManagementPageShell>
  );
}
