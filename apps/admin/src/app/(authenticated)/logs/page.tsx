"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
    <div className="container mx-auto flex h-full flex-col overflow-hidden py-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
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
    </div>
  );
}
