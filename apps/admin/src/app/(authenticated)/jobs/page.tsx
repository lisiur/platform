"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { JobExecutorStats } from "./components/job-executor-stats";
import { JobTable } from "./components/job-table";
import { JobTemplateTable } from "./components/job-template-table";

export default function JobsPage() {
  const t = useTranslations("Jobs");
  const [activeTab, setActiveTab] = useState("templates");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <JobExecutorStats />
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList>
          <TabsTrigger value="templates">{t("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="instances">{t("tabs.instances")}</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="flex min-h-0 overflow-hidden">
          <JobTemplateTable />
        </TabsContent>
        <TabsContent value="instances" className="flex min-h-0 overflow-hidden">
          <JobTable />
        </TabsContent>
      </Tabs>
    </ManagementPageShell>
  );
}
