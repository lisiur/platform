"use client";

import type { Application } from "@repo/frontend";
import { Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { AllowedApiSelector } from "./components/allowed-api-selector";
import { ApplicationAiAgentForm } from "./components/application-ai-agent-form";
import { ApplicationAiAgentUiForm } from "./components/application-ai-agent-ui-form";
import { ApplicationMenuManagement } from "./components/application-menu-management";
import { ApplicationRoleManagement } from "./components/application-role-management";
import { ApplicationSettingsForm } from "./components/application-settings-form";

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

  const fetchApp = useCallback(
    async (refresh = false) => {
      if (!refresh) setLoading(true);
      try {
        const res = await withApiFeedback(
          appClient.api.applications[":id"].$get,
        )({
          param: { id },
        });
        setApp(await res.json());
      } catch {
        if (!refresh) setApp(null);
      } finally {
        if (!refresh) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  if (loading) {
    return (
      <ManagementPageShell
        title={t("settingsTitle")}
        description={t("settingsDescription")}
      >
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </ManagementPageShell>
    );
  }

  if (!app) {
    return (
      <ManagementPageShell
        title={t("settingsTitle")}
        description={t("settingsDescription")}
      >
        <p className="text-muted-foreground">{t("notFound")}</p>
      </ManagementPageShell>
    );
  }

  const backLink = (
    <Link
      href="/applications"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("backToApps")}
    </Link>
  );

  return (
    <ManagementPageShell
      title={
        <>
          {t("settingsTitle")} — {app.name}
        </>
      }
      description={t("settingsDescription")}
      header={backLink}
    >
      <Tabs
        defaultValue="general"
        className="flex min-h-0 flex-col overflow-hidden"
      >
        <TabsList className="mb-6 w-fit shrink-0">
          <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
          <TabsTrigger value="roles">{t("tabs.roles")}</TabsTrigger>
          <TabsTrigger value="menus">{t("tabs.menus")}</TabsTrigger>
          <TabsTrigger value="aiAgent">{t("tabs.aiAgent")}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="general"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <ApplicationSettingsForm app={app} onSuccess={() => fetchApp(true)} />
        </TabsContent>

        <TabsContent
          value="roles"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <ApplicationRoleManagement />
        </TabsContent>

        <TabsContent
          value="menus"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <ApplicationMenuManagement appId={id} />
        </TabsContent>

        <TabsContent
          value="aiAgent"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6">
              <ApplicationAiAgentForm appId={app.id} />
              <ApplicationAiAgentUiForm appId={app.id} />
            </div>
            <AllowedApiSelector
              appId={app.id}
              className="h-full min-h-[30rem] overflow-hidden mt-6"
            />
          </div>
        </TabsContent>
      </Tabs>
    </ManagementPageShell>
  );
}
