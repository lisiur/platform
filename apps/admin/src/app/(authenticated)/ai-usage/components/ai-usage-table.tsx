"use client";

import { DataTablePagination } from "@repo/frontend";
import {
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  DropdownMenuItem,
  Spinner,
  Table,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { Info, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { formatDuration } from "@/utils/format";
import { AiUsageDetailDialog } from "./ai-usage-detail-dialog";
import { AiUsageFilter, type AiUsageFilters } from "./ai-usage-filter";

export type { AiUsageFilters };

export interface AiUsageEventEntry {
  id: string;
  userId: string | null;
  agentId: string | null;
  modelId: string;
  accountId: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cost: number;
  currency: string;
  latencyMs: number | null;
  status: string;
  createdAt: string;
  user?: { id: string; name: string | null; email: string | null } | null;
  agent?: { id: string; name: string; code: string } | null;
  model?: { id: string; displayName: string; modelId: string } | null;
  account?: { id: string; name: string } | null;
}

export function AiUsageTable() {
  const t = useTranslations("AiUsage");
  const [events, setEvents] = useState<AiUsageEventEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AiUsageFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEvent, setDetailEvent] = useState<AiUsageEventEntry | null>(
    null,
  );
  const lastEffectFetchKeyRef = useRef<string>(undefined);

  const pageSize = 20;
  const effectFetchKey = JSON.stringify({ page, filters });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (filters.search) query.search = filters.search;
      if (filters.status) query.status = filters.status;
      if (filters.startDate) query.startDate = filters.startDate.toISOString();
      if (filters.endDate) query.endDate = filters.endDate.toISOString();

      const res = await withApiFeedback(appClient.api.ai["usage-events"].$get)({
        query,
      });
      const data = await res.json();
      setEvents(data.events);
      setTotal(data.total);
      setSelectedIds(new Set());
    } catch {
      setEvents([]);
      setTotal(0);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (lastEffectFetchKeyRef.current === effectFetchKey) return;
    lastEffectFetchKeyRef.current = effectFetchKey;
    fetchEvents();
  }, [effectFetchKey, fetchEvents]);

  function handleFiltersChange(
    newFiltersOrFn: AiUsageFilters | ((prev: AiUsageFilters) => AiUsageFilters),
  ) {
    setFilters(newFiltersOrFn);
    setPage(1);
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    try {
      await withApiFeedback(appClient.api.ai["usage-events"].$delete)({
        json: { ids: Array.from(selectedIds) },
      });
      toast.success(t("deleteSuccess"));
      fetchEvents();
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleSingleDelete(event: AiUsageEventEntry) {
    try {
      await withApiFeedback(appClient.api.ai["usage-events"].$delete)({
        json: { ids: [event.id] },
      });
      toast.success(t("deleteSuccess"));
      fetchEvents();
    } catch {
      // Error handled by API feedback.
    }
  }

  const allSelected = events.length > 0 && selectedIds.size === events.length;

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(events.map((event) => event.id)),
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
      <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AiUsageFilter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          labels={{
            search: t("filters.search"),
            allStatus: t("filters.allStatus"),
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
      ) : events.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noEvents")}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Table
            className="w-[1080px] min-w-[1080px]"
            containerClassName="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border"
          >
            <TableHeader sticky>
              <TableRow>
                <TableHead sticky="left" className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="w-44">{t("columns.createdAt")}</TableHead>
                <TableHead className="w-36">{t("columns.user")}</TableHead>
                <TableHead className="w-36">{t("columns.agent")}</TableHead>
                <TableHead className="w-44">{t("columns.model")}</TableHead>
                <TableHead className="w-36">{t("columns.tokens")}</TableHead>
                <TableHead className="w-32">{t("columns.cost")}</TableHead>
                <TableHead className="w-28">{t("columns.latencyMs")}</TableHead>
                <TableHead className="w-24">{t("columns.status")}</TableHead>
                <TableActionHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow
                  key={event.id}
                  data-selected={selectedIds.has(event.id)}
                >
                  <TableCell sticky="left">
                    <Checkbox
                      checked={selectedIds.has(event.id)}
                      onCheckedChange={() => toggleOne(event.id)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(event.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-[140px]">
                    {event.user?.name || event.user?.email || "-"}
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-[140px]">
                    {event.agent?.name || "-"}
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-[180px]">
                    {event.model?.displayName ||
                      event.model?.modelId ||
                      event.modelId}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {formatNumber(event.inputTokens)}
                    {" / "}
                    {formatNumber(event.outputTokens)}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {event.cost.toFixed(4)} {event.currency}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.latencyMs != null
                      ? formatDuration(event.latencyMs)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={event.status === "ok" ? "secondary" : "outline"}
                    >
                      {event.status}
                    </Badge>
                  </TableCell>
                  <TableActionCell
                    menuLabel={t("columns.actions")}
                    menu={
                      <>
                        <DropdownMenuItem onClick={() => setDetailEvent(event)}>
                          <Info />
                          {t("detail")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleSingleDelete(event)}
                        >
                          <Trash2 />
                          {t("delete")}
                        </DropdownMenuItem>
                      </>
                    }
                  >
                    <ButtonGroup className="ml-auto">
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("detail")}
                        tooltip={t("detail")}
                        onClick={() => setDetailEvent(event)}
                      >
                        <Info />
                      </TooltipButton>
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        tooltip={t("delete")}
                        onClick={() => handleSingleDelete(event)}
                      >
                        <Trash2 />
                      </TooltipButton>
                    </ButtonGroup>
                  </TableActionCell>
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
      <AiUsageDetailDialog
        open={!!detailEvent}
        event={detailEvent}
        onOpenChange={(open) => !open && setDetailEvent(null)}
      />
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}
