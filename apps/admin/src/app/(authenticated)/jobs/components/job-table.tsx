"use client";

import { DataTablePagination } from "@repo/frontend";
import {
  Badge,
  Button,
  ButtonGroup,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import { Eye, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { JobDetailSheet } from "./job-detail-sheet";
import type { JobDetail } from "./job-detail-tabs";

interface JobInstance {
  id: string;
  jobId?: string | null;
  type: string;
  description?: string | null;
  status: string;
  priority: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledAt: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

const STATUS_OPTIONS = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;

function statusVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "secondary" as const;
    case "FAILED":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export function JobTable() {
  const t = useTranslations("Jobs");
  const [jobs, setJobs] = useState<JobInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState("");
  const [detailJob, setDetailJob] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const lastEffectFetchKeyRef = useRef<string>(undefined);

  const pageSize = 20;
  const effectFetchKey = JSON.stringify({ page, statusFilter, typeFilter });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (statusFilter) query.status = statusFilter;
      if (typeFilter) query.type = typeFilter;

      const res = await withApiFeedback(appClient.api["job-instances"].$get)({
        query,
      });
      const data = await res.json();
      setJobs(data.jobs);
      setTotal(data.total);
    } catch {
      setJobs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => {
    if (lastEffectFetchKeyRef.current === effectFetchKey) return;
    lastEffectFetchKeyRef.current = effectFetchKey;
    fetchJobs();
  }, [effectFetchKey, fetchJobs]);

  function handleStatusChange(value: string | null) {
    setStatusFilter(!value || value === "all" ? "" : value);
    setPage(1);
  }

  const typeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  function handleTypeChange(value: string) {
    setTypeFilter(value);
    if (typeDebounceRef.current) clearTimeout(typeDebounceRef.current);
    typeDebounceRef.current = setTimeout(() => setPage(1), 300);
  }

  useEffect(() => {
    return () => {
      if (typeDebounceRef.current) clearTimeout(typeDebounceRef.current);
    };
  }, []);

  async function handleCancel(job: JobInstance) {
    try {
      await withApiFeedback(appClient.api["job-instances"][":id"].$delete)({
        param: { id: job.id },
      });
      fetchJobs();
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleView(job: JobInstance) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailJob(null);
    try {
      const res = await withApiFeedback(
        appClient.api["job-instances"][":id"].$get,
      )({ param: { id: job.id } });
      setDetailJob((await res.json()) as JobDetail);
    } catch {
      setDetailJob(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const hasFilters = statusFilter !== "" || typeFilter !== "";
  function handleClearFilters() {
    setStatusFilter("");
    setTypeFilter("");
    setPage(1);
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter || "all"}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="h-9 w-36">
              {statusFilter
                ? t(`status.${statusFilter}`)
                : t("filters.allStatus")}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allStatus")}</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-9 w-48"
            placeholder={t("search")}
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
          />
          {hasFilters && (
            <button
              type="button"
              className="text-muted-foreground text-sm hover:text-foreground"
              onClick={handleClearFilters}
            >
              {t("filters.clear")}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noJobs")}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Table
            className="w-[1320px] min-w-[1320px]"
            containerClassName="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border"
          >
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-32">{t("columns.id")}</TableHead>
                <TableHead className="w-40">{t("columns.type")}</TableHead>
                <TableHead className="w-64">
                  {t("columns.description")}
                </TableHead>
                <TableHead className="w-28">{t("columns.status")}</TableHead>
                <TableHead className="w-24">{t("columns.priority")}</TableHead>
                <TableHead className="w-28">{t("columns.attempts")}</TableHead>
                <TableHead className="w-44">{t("columns.createdAt")}</TableHead>
                <TableHead className="w-44">
                  {t("columns.completedAt")}
                </TableHead>
                <TableHead
                  sticky="right"
                  className="w-24 bg-background text-right"
                >
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs">
                    {job.id.slice(-8)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {job.type}
                  </TableCell>
                  <TableCell
                    className="max-w-64 truncate text-xs text-muted-foreground"
                    title={job.description ?? ""}
                  >
                    {job.description ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>
                      {t(`status.${job.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {t(`priority.${job.priority}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.attempts}/{job.maxAttempts}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(job.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {job.completedAt ? formatDateTime(job.completedAt) : "-"}
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
                              aria-label={t("view")}
                              onClick={() => handleView(job)}
                            >
                              <Eye />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("view")}</TooltipContent>
                      </Tooltip>
                      {job.status === "PENDING" && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("cancel")}
                                onClick={() => handleCancel(job)}
                              >
                                <X />
                              </Button>
                            }
                          />
                          <TooltipContent>{t("cancel")}</TooltipContent>
                        </Tooltip>
                      )}
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
      <JobDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        job={detailJob}
        loading={detailLoading}
        title={t("detail.title")}
      />
    </div>
  );
}
