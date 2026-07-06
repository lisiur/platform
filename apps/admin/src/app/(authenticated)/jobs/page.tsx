"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ArchivedJobTable } from "./components/archived-job-table";
import { JobExecutorStats } from "./components/job-executor-stats";
import { JobTable } from "./components/job-table";

export default function JobsPage() {
  const t = useTranslations("Jobs");
  const [activeTab, setActiveTab] = useState("active");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <JobExecutorStats />
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList>
          <TabsTrigger value="active">{t("tabs.active")}</TabsTrigger>
          <TabsTrigger value="archived">{t("tabs.archived")}</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="flex min-h-0 overflow-hidden">
          <JobTable />
        </TabsContent>
        <TabsContent value="archived" className="flex min-h-0 overflow-hidden">
          <ArchivedJobTable />
        </TabsContent>
      </Tabs>
    </ManagementPageShell>
  );
}
