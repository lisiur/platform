"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ApplicationMenuManagement } from "../components/application-menu-management";

interface MenusPageProps {
  params: Promise<{ id: string }>;
}

export default function MenusPage({ params }: MenusPageProps) {
  const t = useTranslations("Menus");
  const { id } = use(params);

  return (
    <ManagementPageShell
      title={t("title")}
      description={t("description")}
      header={
        <Link
          href={`/applications/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToSettings")}
        </Link>
      }
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <ApplicationMenuManagement appId={id} />
      </div>
    </ManagementPageShell>
  );
}
