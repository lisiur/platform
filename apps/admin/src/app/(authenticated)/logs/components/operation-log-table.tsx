"use client";

import { DataTablePagination } from "@repo/frontend";
import {
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { Eye, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { LogDetailDialog } from "./log-detail-dialog";
import {
  OperationLogFilter,
  type OperationLogFilters,
} from "./operation-log-filter";

export type { OperationLogFilters };

interface OperationLogEntry {
  id: string;
  traceId: string;
  sessionId?: string | null;
  level: string;
  source?: string | null;
  module?: string | null;
  event: string;
  message?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  errorName?: string | null;
  errorMessage?: string | null;
  stack?: string | null;
  metadata?: unknown;
  createdAt: string;
}

const LEVEL_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  debug: "outline",
  info: "secondary",
  warn: "default",
  error: "destructive",
};

interface OperationLogTableProps {
  filters: OperationLogFilters;
  onFiltersChange: (
    newFiltersOrFn:
      | OperationLogFilters
      | ((prev: OperationLogFilters) => OperationLogFilters),
  ) => void;
}

export function OperationLogTable({
  filters,
  onFiltersChange,
}: OperationLogTableProps) {
  const t = useTranslations("Logs");
  const [logs, setLogs] = useState<OperationLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailLog, setDetailLog] = useState<OperationLogEntry | null>(null);
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
      if (filters.level) query.level = filters.level;
      if (filters.module) query.module = filters.module;
      if (filters.event) query.event = filters.event;
      if (filters.path) query.path = filters.path;
      if (filters.statusCode) query.statusCode = Number(filters.statusCode);
      if (filters.startDate) query.startDate = filters.startDate.toISOString();
      if (filters.endDate) query.endDate = filters.endDate.toISOString();

      const res = await withApiFeedback(appClient.api["operation-logs"].$get)({
        query,
      });
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setSelectedIds(new Set());
    } catch {
      setLogs([]);
      setTotal(0);
      setSelectedIds(new Set());
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
      | OperationLogFilters
      | ((prev: OperationLogFilters) => OperationLogFilters),
  ) {
    onFiltersChange(newFiltersOrFn);
    setPage(1);
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    try {
      await withApiFeedback(appClient.api["operation-logs"].$delete)({
        json: { ids: Array.from(selectedIds) },
      });
      toast.success(t("deleteSuccess"));
      fetchLogs();
    } catch {
      // Error handled by API feedback.
    }
  }

  const allSelected = logs.length > 0 && selectedIds.size === logs.length;

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(logs.map((log) => log.id)),
    );
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="mb-3 shrink-0">
        <h2 className="font-semibold text-lg">{t("operation.title")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("operation.description")}
        </p>
      </div>
      <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <OperationLogFilter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          labels={{
            traceId: t("filters.traceId"),
            sessionId: t("filters.sessionId"),
            level: t("filters.level"),
            module: t("filters.module"),
            event: t("filters.event"),
            path: t("filters.path"),
            statusCode: t("filters.statusCode"),
            allLevels: t("filters.allLevels"),
            clear: t("clearFilters"),
            filtersButton: t("filtersButton"),
            filtersTitle: t("filtersTitle"),
            apply: t("apply"),
          }}
        />
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
            <Trash2 className="h-4 w-4" />
            {t("batchDelete")} ({selectedIds.size})
          </Button>
        )}
      </div>
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("operation.noLogs")}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Table
            className="w-[1650px] min-w-[1650px]"
            containerClassName="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border"
          >
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="w-44">{t("columns.createdAt")}</TableHead>
                <TableHead className="w-24">{t("columns.level")}</TableHead>
                <TableHead className="w-40">{t("columns.event")}</TableHead>
                <TableHead className="w-36">{t("columns.module")}</TableHead>
                <TableHead className="w-96">{t("columns.request")}</TableHead>
                <TableHead>{t("columns.statusCode")}</TableHead>
                <TableHead>{t("columns.durationMs")}</TableHead>
                <TableHead className="w-44">{t("columns.traceId")}</TableHead>
                <TableHead className="w-44">{t("columns.sessionId")}</TableHead>
                <TableHead className="w-72">{t("columns.message")}</TableHead>
                <TableHead sticky="right" className="bg-background text-right">
                  {t("columns.detail")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} data-selected={selectedIds.has(log.id)}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(log.id)}
                      onCheckedChange={() => toggleOne(log.id)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={LEVEL_VARIANT[log.level] ?? "outline"}>
                      {log.level.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.event}
                  </TableCell>
                  <TableCell>{log.module || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {[log.method, log.path].filter(Boolean).join(" ") || "-"}
                  </TableCell>
                  <TableCell>{log.statusCode ?? "-"}</TableCell>
                  <TableCell>{log.durationMs ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.traceId}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.sessionId || "-"}
                  </TableCell>
                  <TableCell className="max-w-64 truncate">
                    {log.errorMessage || log.message || "-"}
                  </TableCell>
                  <TableCell
                    sticky="right"
                    className="bg-background text-right"
                  >
                    <ButtonGroup className="ml-auto">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("viewDetail")}
                              onClick={() => setDetailLog(log)}
                            >
                              <Eye />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("viewDetail")}</TooltipContent>
                      </Tooltip>
                    </ButtonGroup>
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
        title={t("operation.detailTitle")}
        description={detailLog?.event}
        traceId={detailLog?.traceId}
        data={detailLog}
        onOpenChange={(open) => !open && setDetailLog(null)}
      />
    </div>
  );
}
