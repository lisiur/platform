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
import { Eye, Info, Replace, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { formatBytes } from "@/utils/format";
import { UploadDetailDialog } from "./upload-detail-dialog";
import { UploadDownloadDialog } from "./upload-download-dialog";
import { UploadFilter, type UploadFilters } from "./upload-filter";
import { UploadReplaceDialog } from "./upload-replace-dialog";

export type { UploadFilters };

export interface UploadEntry {
  id: string;
  path: string;
  mimeType: string;
  size: number;
  visibility: string;
  uploaderId: string;
  createdAt: string;
  uploader: { id: string; name: string; email: string };
}

export function UploadTable() {
  const t = useTranslations("Uploads");
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<UploadFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailUpload, setDetailUpload] = useState<UploadEntry | null>(null);
  const [replaceUpload, setReplaceUpload] = useState<UploadEntry | null>(null);
  const [downloadUpload, setDownloadUpload] = useState<UploadEntry | null>(
    null,
  );
  const lastEffectFetchKeyRef = useRef<string>(undefined);

  const pageSize = 20;
  const effectFetchKey = JSON.stringify({ page, filters });

  const fetchUploads = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (filters.visibility) query.visibility = filters.visibility;
      if (filters.mimeType) query.mimeType = filters.mimeType;
      if (filters.uploader) query.uploader = filters.uploader;
      if (filters.startDate) query.startDate = filters.startDate.toISOString();
      if (filters.endDate) query.endDate = filters.endDate.toISOString();

      const res = await withApiFeedback(appClient.api.upload.$get)({
        query,
      });
      const data = await res.json();
      setUploads(data.uploads);
      setTotal(data.total);
      setSelectedIds(new Set());
    } catch {
      setUploads([]);
      setTotal(0);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (lastEffectFetchKeyRef.current === effectFetchKey) return;
    lastEffectFetchKeyRef.current = effectFetchKey;
    fetchUploads();
  }, [effectFetchKey, fetchUploads]);

  function handleFiltersChange(
    newFiltersOrFn: UploadFilters | ((prev: UploadFilters) => UploadFilters),
  ) {
    setFilters(newFiltersOrFn);
    setPage(1);
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    try {
      await withApiFeedback(appClient.api.upload.$delete)({
        json: { ids: Array.from(selectedIds) },
      });
      toast.success(t("deleteSuccess"));
      fetchUploads();
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleSingleDelete(upload: UploadEntry) {
    try {
      await withApiFeedback(appClient.api.upload.$delete)({
        json: { ids: [upload.id] },
      });
      toast.success(t("deleteSuccess"));
      fetchUploads();
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleViewFile(upload: UploadEntry) {
    if (upload.mimeType.startsWith("image/")) {
      let url = `/api/upload/${upload.id}`;
      if (upload.visibility === "private") {
        try {
          const res = await withApiFeedback(
            appClient.api.upload[":id"].sign.$post,
          )({
            param: { id: upload.id },
          });
          const data = await res.json();
          url = data.url;
        } catch {
          return;
        }
      }
      window.open(`${window.location.origin}${url}`, "_blank");
    } else {
      setDownloadUpload(upload);
    }
  }

  const allSelected = uploads.length > 0 && selectedIds.size === uploads.length;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(uploads.map((u) => u.id)));
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
        <UploadFilter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          labels={{
            mimeType: t("filters.mimeType"),
            uploader: t("filters.uploader"),
            allVisibility: t("filters.allVisibility"),
            clear: t("clearFilters"),
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
      ) : uploads.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noUploads")}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Table
            className="w-[1024px] min-w-[1024px]"
            containerClassName="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border"
          >
            <TableHeader sticky>
              <TableRow>
                <TableHead sticky="left" className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="w-44">{t("columns.createdAt")}</TableHead>
                <TableHead className="w-40">{t("columns.mimeType")}</TableHead>
                <TableHead className="w-28">{t("columns.size")}</TableHead>
                <TableHead className="w-28">
                  {t("columns.visibility")}
                </TableHead>
                <TableHead className="w-56">{t("columns.uploader")}</TableHead>
                <TableHead
                  sticky="right"
                  className="w-48 bg-background text-right"
                >
                  {t("columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((upload) => (
                <TableRow
                  key={upload.id}
                  data-selected={selectedIds.has(upload.id)}
                >
                  <TableCell sticky="left">
                    <Checkbox
                      checked={selectedIds.has(upload.id)}
                      onCheckedChange={() => toggleOne(upload.id)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(upload.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {upload.mimeType}
                  </TableCell>
                  <TableCell>{formatBytes(upload.size)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        upload.visibility === "public" ? "secondary" : "outline"
                      }
                    >
                      {upload.visibility}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{upload.uploader.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {upload.uploader.email}
                    </div>
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
                              aria-label={t("viewFile")}
                              onClick={() => handleViewFile(upload)}
                            >
                              <Eye />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("viewFile")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("detail")}
                              onClick={() => setDetailUpload(upload)}
                            >
                              <Info />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("detail")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("replace")}
                              onClick={() => setReplaceUpload(upload)}
                            >
                              <Replace />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("replace")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("delete")}
                              onClick={() => handleSingleDelete(upload)}
                            >
                              <Trash2 />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("delete")}</TooltipContent>
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
      <UploadDetailDialog
        open={!!detailUpload}
        upload={detailUpload}
        onOpenChange={(open) => !open && setDetailUpload(null)}
      />
      <UploadReplaceDialog
        open={!!replaceUpload}
        upload={replaceUpload}
        onOpenChange={(open) => !open && setReplaceUpload(null)}
        onReplaced={fetchUploads}
      />
      <UploadDownloadDialog
        open={!!downloadUpload}
        upload={downloadUpload}
        onOpenChange={(open) => !open && setDownloadUpload(null)}
      />
    </div>
  );
}
