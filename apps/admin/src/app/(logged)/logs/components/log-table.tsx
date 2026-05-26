"use client";

import { Eye, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { apiWithFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import type { LogFilters } from "./log-filter";
import { LogFilter } from "./log-filter";

interface LogEntry {
  id: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  module: string;
  targetId?: string | null;
  targetName?: string | null;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

const ACTION_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  login: "outline",
  logout: "outline",
  assign: "default",
  remove: "destructive",
  batchUpsert: "secondary",
};

export function LogTable() {
  const t = useTranslations("Logs");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LogFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailLog, setDetailLog] = useState<LogEntry | null>(null);

  const pageSize = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (filters.action) query.action = filters.action;
      if (filters.module) query.module = filters.module;
      if (filters.startDate) query.startDate = filters.startDate.toISOString();
      if (filters.endDate) query.endDate = filters.endDate.toISOString();

      const res = await apiWithFeedback(appClient.api.log.$get)({ query });
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setSelectedIds(new Set());
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, page, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFiltersChange(
    newFiltersOrFn: LogFilters | ((prev: LogFilters) => LogFilters),
  ) {
    setFilters(newFiltersOrFn);
    setPage(1);
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    try {
      await apiWithFeedback(appClient.api.log.$delete)({
        json: { ids: Array.from(selectedIds) },
      });
      toast.success(t("deleteSuccess"));
      fetchLogs();
    } catch {
      toast.error(t("deleteFailed"));
    }
  }

  const allSelected = logs.length > 0 && selectedIds.size === logs.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map((l) => l.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function formatTime(dateStr: string) {
    return formatDateTime(dateStr);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LogFilter filters={filters} onFiltersChange={handleFiltersChange} />
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
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
          {t("noLogs")}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
                <TableHead>{t("columns.userName")}</TableHead>
                <TableHead>{t("columns.module")}</TableHead>
                <TableHead>{t("columns.action")}</TableHead>
                <TableHead>{t("columns.targetName")}</TableHead>
                <TableHead>{t("columns.ip")}</TableHead>
                <TableHead>{t("columns.detail")}</TableHead>
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
                    {formatTime(log.createdAt)}
                  </TableCell>
                  <TableCell>{log.userName || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {(() => {
                        try {
                          return t(`modules.${log.module}`);
                        } catch {
                          return log.module;
                        }
                      })()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[log.action] ?? "outline"}>
                      {(() => {
                        try {
                          return t(`actions.${log.action}`);
                        } catch {
                          return log.action;
                        }
                      })()}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.targetName || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.ip || "-"}
                  </TableCell>
                  <TableCell>
                    {log.detail ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailLog(log)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {t("viewDetail")}
                      </Button>
                    ) : (
                      "-"
                    )}
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
      <Dialog
        open={!!detailLog}
        onOpenChange={(open) => !open && setDetailLog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detailTitle")}</DialogTitle>
            <DialogDescription>
              {detailLog
                ? `${t(`actions.${detailLog.action}`)} - ${t(`modules.${detailLog.module}`)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
            {detailLog?.detail
              ? JSON.stringify(JSON.parse(detailLog.detail), null, 2)
              : "-"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
