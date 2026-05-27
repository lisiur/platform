"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";
import { ApplicationMenuManagement } from "./components/application-menu-management";
import { ApplicationRoleManagement } from "./components/application-role-management";

interface Application {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  sortOrder: number;
  createdAt: string;
}

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ApplicationDetailPage({
  params,
}: ApplicationDetailPageProps) {
  const t = useTranslations("Applications");
  const { id } = use(params);
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchApp = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiWithFeedback(appClient.api.applications[":id"].$get)(
        {
          param: { id },
        },
      );
      setApp(await res.json());
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  if (loading) {
    return (
      <div className="container mx-auto flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex h-full min-h-0 flex-col overflow-hidden py-8">
      <div className="mb-6 shrink-0">
        <Link
          href="/applications"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToApps")}
        </Link>
        <h1 className="text-2xl font-bold">
          {t("settingsTitle")} — {app.name}
        </h1>
        <p className="text-muted-foreground">{t("settingsDescription")}</p>
      </div>

      <Tabs
        defaultValue="roles"
        className="flex min-h-0 flex-col overflow-hidden"
      >
        <TabsList className="mb-6 w-fit shrink-0">
          <TabsTrigger value="roles">{t("tabs.roles")}</TabsTrigger>
          <TabsTrigger value="menus">{t("tabs.menus")}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="roles"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <ApplicationRoleManagement appId={id} />
        </TabsContent>

        <TabsContent
          value="menus"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <ApplicationMenuManagement appId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
