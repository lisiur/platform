"use client";

import { Button } from "@repo/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
      header={
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/collection" />}
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Button>
      }
      title={t("detailTitle")}
      description={t("detailDescription")}
    >
      <ItemDetail id={id} />
    </ManagementPageShell>
  );
}
