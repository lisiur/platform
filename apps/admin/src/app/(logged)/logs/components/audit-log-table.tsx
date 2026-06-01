"use client";

import { Eye, GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { AuditLogFilter, type AuditLogFilters } from "./audit-log-filter";
import { LogDetailDialog } from "./log-detail-dialog";

export type { AuditLogFilters };

interface AuditLogEntry {
  id: string;
  traceId: string;
  sessionId?: string | null;
  userId?: string | null;
  userName?: string | null;
  event: string;
  category: string;
  severity: string;
  outcome: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

const SEVERITY_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  info: "secondary",
  warning: "default",
  critical: "destructive",
};

const OUTCOME_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  success: "secondary",
  failure: "destructive",
  denied: "destructive",
};

interface AuditLogTableProps {
  filters: AuditLogFilters;
  onFiltersChange: (
    newFiltersOrFn:
      | AuditLogFilters
      | ((prev: AuditLogFilters) => AuditLogFilters),
  ) => void;
  onTraceChange?: (traceId: string) => void;
}

export function AuditLogTable({
  filters,
  onFiltersChange,
  onTraceChange,
}: AuditLogTableProps) {
  const t = useTranslations("Logs");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLog, setDetailLog] = useState<AuditLogEntry | null>(null);
  const lastEffectFetchKeyRef = useRef<string>(undefined);

  const pageSize = 20;
  const effectFetchKey = JSON.stringify({ page, filters });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (filters.traceId) query.traceId = filters.traceId;
      if (filters.sessionId) query.sessionId = filters.sessionId;
      if (filters.userId) query.userId = filters.userId;
      if (filters.userName) query.userName = filters.userName;
      if (filters.event) query.event = filters.event;
      if (filters.category) query.category = filters.category;
      if (filters.severity) query.severity = filters.severity;
      if (filters.outcome) query.outcome = filters.outcome;
      if (filters.targetType) query.targetType = filters.targetType;
      if (filters.targetId) query.targetId = filters.targetId;
      if (filters.startDate) query.startDate = filters.startDate.toISOString();
      if (filters.endDate) query.endDate = filters.endDate.toISOString();

      const res = await withApiFeedback(appClient.api["audit-log"].$get)({
        query,
      });
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (lastEffectFetchKeyRef.current === effectFetchKey) return;
    lastEffectFetchKeyRef.current = effectFetchKey;
    fetchLogs();
  }, [effectFetchKey, fetchLogs]);

  function handleFiltersChange(
    newFiltersOrFn:
      | AuditLogFilters
      | ((prev: AuditLogFilters) => AuditLogFilters),
  ) {
    onFiltersChange(newFiltersOrFn);
    setPage(1);
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="mb-3 shrink-0">
        <h2 className="font-semibold text-lg">{t("audit.title")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("audit.description")}
        </p>
      </div>
      <div className="mb-4 shrink-0">
        <AuditLogFilter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          labels={{
            traceId: t("filters.traceId"),
            sessionId: t("filters.sessionId"),
            userName: t("filters.userName"),
            event: t("filters.event"),
            category: t("filters.category"),
            targetType: t("filters.targetType"),
            allSeverities: t("filters.allSeverities"),
            allOutcomes: t("filters.allOutcomes"),
            clear: t("clearFilters"),
          }}
        />
      </div>
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("audit.noLogs")}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Table
            className="w-[1650px] min-w-[1650px]"
            containerClassName="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border"
          >
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-44">{t("columns.createdAt")}</TableHead>
                <TableHead className="w-44">{t("columns.userName")}</TableHead>
                <TableHead className="w-52">{t("columns.event")}</TableHead>
                <TableHead className="w-40">{t("columns.category")}</TableHead>
                <TableHead className="w-28">{t("columns.outcome")}</TableHead>
                <TableHead className="w-28">{t("columns.severity")}</TableHead>
                <TableHead className="w-64">{t("columns.target")}</TableHead>
                <TableHead className="w-40">{t("columns.ip")}</TableHead>
                <TableHead className="w-44">{t("columns.traceId")}</TableHead>
                <TableHead className="w-44">{t("columns.sessionId")}</TableHead>
                <TableHead sticky="right" className="bg-background text-right">
                  {t("columns.detail")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell>{log.userName || log.userId || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.event}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={OUTCOME_VARIANT[log.outcome] ?? "outline"}>
                      {log.outcome}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={SEVERITY_VARIANT[log.severity] ?? "outline"}
                    >
                      {log.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {[log.targetType, log.targetName || log.targetId]
                      .filter(Boolean)
                      .join(" / ") || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.ip || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.traceId}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.sessionId || "-"}
                  </TableCell>
                  <TableCell
                    sticky="right"
                    className="bg-background text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      {onTraceChange && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onTraceChange(log.traceId)}
                        >
                          <GitBranch className="mr-1 h-3 w-3" />
                          {t("trace")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailLog(log)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {t("viewDetail")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination
            className="shrink-0"
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}
      <LogDetailDialog
        open={!!detailLog}
        title={t("audit.detailTitle")}
        description={detailLog?.event}
        traceId={detailLog?.traceId}
        data={detailLog}
        onOpenChange={(open) => !open && setDetailLog(null)}
      />
    </div>
  );
}
