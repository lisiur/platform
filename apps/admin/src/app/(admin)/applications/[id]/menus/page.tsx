"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use } from "react";
import { ApplicationMenuManagement } from "../components/application-menu-management";

interface MenusPageProps {
  params: Promise<{ id: string }>;
}

export default function MenusPage({ params }: MenusPageProps) {
  const t = useTranslations("Menus");
  const { id } = use(params);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden py-8">
      <div className="mb-6 shrink-0">
        <div className="container mx-auto">
          <Link
            href={`/applications/${id}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToSettings")}
          </Link>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      <div className="container mx-auto min-h-0 flex-1 overflow-hidden">
        <ApplicationMenuManagement appId={id} />
      </div>
    </div>
  );
}
