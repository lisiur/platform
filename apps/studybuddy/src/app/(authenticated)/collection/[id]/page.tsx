"use client";

import { useTranslations } from "next-intl";
import { use } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ItemDetail } from "./components/item-detail";

interface CollectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CollectionDetailPage({
  params,
}: CollectionDetailPageProps) {
  const t = useTranslations("Collection");
  const { id } = use(params);
  return (
    <ManagementPageShell
      title={t("detailTitle")}
      description={t("detailDescription")}
    >
      <ItemDetail id={id} />
    </ManagementPageShell>
  );
}
