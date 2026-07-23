"use client";

import { DataTablePagination } from "@repo/frontend";
import {
  Badge,
  Button,
  ButtonGroup,
  Input,
  Spinner,
  Switch,
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
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import {
  JobTemplateDialog,
  type JobTemplateInitialValues,
} from "./job-template-dialog";

interface JobTemplate {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  cronExpression?: string | null;
  enabled: boolean;
  priority: string;
  maxAttempts: number;
  timeoutMs: number;
  payload?: unknown;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
}

export function JobTemplateTable() {
  const t = useTranslations("Jobs");
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editInitial, setEditInitial] =
    useState<JobTemplateInitialValues | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const lastEffectFetchKeyRef = useRef<string>(undefined);

  const pageSize = 20;
  const effectFetchKey = JSON.stringify({ page, typeFilter });

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (typeFilter) query.type = typeFilter;

      const res = await withApiFeedback(appClient.api.jobs.$get)({ query });
      const data = await res.json();
      setTemplates(data.jobs);
      setTotal(data.total);
    } catch {
      setTemplates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => {
    if (lastEffectFetchKeyRef.current === effectFetchKey) return;
    lastEffectFetchKeyRef.current = effectFetchKey;
    fetchTemplates();
  }, [effectFetchKey, fetchTemplates]);

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

  async function handleToggleEnabled(tpl: JobTemplate) {
    setTogglingId(tpl.id);
    try {
      await withApiFeedback(appClient.api.jobs[":id"].$patch)({
        param: { id: tpl.id },
        json: { enabled: !tpl.enabled },
      });
      fetchTemplates();
    } catch {
      // Error handled by API feedback.
    } finally {
      setTogglingId(null);
    }
  }

  function handleEdit(tpl: JobTemplate) {
    setEditInitial({
      id: tpl.id,
      name: tpl.name,
      type: tpl.type,
      description: tpl.description ?? undefined,
      cronExpression: tpl.cronExpression,
      enabled: tpl.enabled,
      priority: tpl.priority,
      maxAttempts: tpl.maxAttempts,
      timeoutMs: tpl.timeoutMs,
      payload: tpl.payload,
    });
    setEditOpen(true);
  }

  async function handleTrigger(tpl: JobTemplate) {
    try {
      await withApiFeedback(appClient.api.jobs[":id"].trigger.$post)({
        param: { id: tpl.id },
      });
      toast.success(t("triggerSuccess"));
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleDelete(tpl: JobTemplate) {
    const confirmed = await confirm({
      title: t("remove"),
      description: t("confirmDelete"),
      confirmLabel: t("remove"),
      cancelLabel: t("cancelBtn"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(appClient.api.jobs[":id"].$delete)({
        param: { id: tpl.id },
      });
      toast.success(t("deleteSuccess"));
      fetchTemplates();
    } catch {
      // Error handled by API feedback.
    }
  }

  const hasFilters = typeFilter !== "";
  function handleClearFilters() {
    setTypeFilter("");
    setPage(1);
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("addTemplate")}
        </Button>
      </div>
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noTemplates")}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Table
            className="w-[1320px] min-w-[1320px]"
            containerClassName="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border"
          >
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-36">{t("columns.name")}</TableHead>
                <TableHead className="w-40">{t("columns.type")}</TableHead>
                <TableHead className="w-56">
                  {t("columns.description")}
                </TableHead>
                <TableHead className="w-36">{t("columns.cron")}</TableHead>
                <TableHead className="w-24">{t("columns.enabled")}</TableHead>
                <TableHead className="w-24">{t("columns.priority")}</TableHead>
                <TableHead className="w-44">{t("columns.nextRun")}</TableHead>
                <TableHead className="w-44">{t("columns.lastRun")}</TableHead>
                <TableHead
                  sticky="right"
                  className="w-36 bg-background text-right"
                >
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={tpl.id}>
                  <TableCell className="font-mono text-sm">
                    {tpl.name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {tpl.type}
                  </TableCell>
                  <TableCell
                    className="max-w-56 truncate text-xs text-muted-foreground"
                    title={tpl.description ?? ""}
                  >
                    {tpl.description ?? "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {tpl.cronExpression ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={tpl.enabled}
                      disabled={togglingId === tpl.id}
                      onCheckedChange={() => handleToggleEnabled(tpl)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {t(`priority.${tpl.priority}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {tpl.nextRunAt ? formatDateTime(tpl.nextRunAt) : "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {tpl.lastRunAt ? formatDateTime(tpl.lastRunAt) : "-"}
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
                              aria-label={t("trigger")}
                              onClick={() => handleTrigger(tpl)}
                            >
                              <Play />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("trigger")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("edit")}
                              onClick={() => handleEdit(tpl)}
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("edit")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("remove")}
                              onClick={() => handleDelete(tpl)}
                            >
                              <Trash2 />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("remove")}</TooltipContent>
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
      <JobTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={fetchTemplates}
      />
      <JobTemplateDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchTemplates}
        initialValues={editInitial}
      />
    </div>
  );
}
