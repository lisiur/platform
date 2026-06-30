"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import {
  type AuditLogFilters,
  AuditLogTable,
} from "./components/audit-log-table";
import {
  type OperationLogFilters,
  OperationLogTable,
} from "./components/operation-log-table";

export default function LogsPage() {
  const t = useTranslations("Logs");
  const [activeTab, setActiveTab] = useState("operation");
  const [operationFilters, setOperationFilters] = useState<OperationLogFilters>(
    {},
  );
  const [auditFilters, setAuditFilters] = useState<AuditLogFilters>({});

  function handleAuditTrace(traceId: string) {
    setOperationFilters((prev) => ({ ...prev, traceId }));
    setActiveTab("operation");
  }

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList>
          <TabsTrigger value="operation">{t("tabs.operation")}</TabsTrigger>
          <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>
        </TabsList>
        <TabsContent value="operation" className="flex min-h-0 overflow-hidden">
          <OperationLogTable
            filters={operationFilters}
            onFiltersChange={setOperationFilters}
          />
        </TabsContent>
        <TabsContent value="audit" className="flex min-h-0 overflow-hidden">
          <AuditLogTable
            filters={auditFilters}
            onFiltersChange={setAuditFilters}
            onTraceChange={handleAuditTrace}
          />
        </TabsContent>
      </Tabs>
    </ManagementPageShell>
  );
}
