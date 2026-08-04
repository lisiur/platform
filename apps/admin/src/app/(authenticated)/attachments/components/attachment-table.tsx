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
import { Eye, Info, Replace, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { formatBytes } from "@/utils/format";
import { AttachmentDetailDialog } from "./attachment-detail-dialog";
import { AttachmentDownloadDialog } from "./attachment-download-dialog";
import { AttachmentFilter, type AttachmentFilters } from "./attachment-filter";
import { AttachmentReplaceDialog } from "./attachment-replace-dialog";

export type { AttachmentFilters };

export interface AttachmentEntry {
  id: string;
  bizType: string;
  bizId: string;
  visibility: string;
  createdBy: string;
  createdAt: string;
  upload: {
    id: string;
    path: string;
    mimeType: string;
    size: number;
    hash: string;
  };
}

export function AttachmentTable() {
  const t = useTranslations("Attachments");
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AttachmentFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailAttachment, setDetailAttachment] =
    useState<AttachmentEntry | null>(null);
  const [replaceAttachment, setReplaceAttachment] =
    useState<AttachmentEntry | null>(null);
  const [downloadAttachment, setDownloadAttachment] =
    useState<AttachmentEntry | null>(null);
  const lastEffectFetchKeyRef = useRef<string>(undefined);

  const pageSize = 20;
  const effectFetchKey = JSON.stringify({ page, filters });

  const fetchAttachments = useCallback(async () => {
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

      const res = await withApiFeedback(appClient.api.attachment.$get)({
        query,
      });
      const data = await res.json();
      setAttachments(data.attachments);
      setTotal(data.total);
      setSelectedIds(new Set());
    } catch {
      setAttachments([]);
      setTotal(0);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (lastEffectFetchKeyRef.current === effectFetchKey) return;
    lastEffectFetchKeyRef.current = effectFetchKey;
    fetchAttachments();
  }, [effectFetchKey, fetchAttachments]);

  function handleFiltersChange(
    newFiltersOrFn:
      | AttachmentFilters
      | ((prev: AttachmentFilters) => AttachmentFilters),
  ) {
    setFilters(newFiltersOrFn);
    setPage(1);
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    try {
      await withApiFeedback(appClient.api.attachment.$delete)({
        json: { ids: Array.from(selectedIds) },
      });
      toast.success(t("deleteSuccess"));
      fetchAttachments();
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleSingleDelete(attachment: AttachmentEntry) {
    try {
      await withApiFeedback(appClient.api.attachment.$delete)({
        json: { ids: [attachment.id] },
      });
      toast.success(t("deleteSuccess"));
      fetchAttachments();
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleViewFile(attachment: AttachmentEntry) {
    if (attachment.upload.mimeType.startsWith("image/")) {
      let url = `/api/attachment/${attachment.id}`;
      if (attachment.visibility === "private") {
        try {
          const res = await withApiFeedback(
            appClient.api.attachment[":id"].sign.$post,
          )({
            param: { id: attachment.id },
          });
          const data = await res.json();
          url = data.url;
        } catch {
          return;
        }
      }
      window.open(`${window.location.origin}${url}`, "_blank");
    } else {
      setDownloadAttachment(attachment);
    }
  }

  const allSelected =
    attachments.length > 0 && selectedIds.size === attachments.length;

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(attachments.map((a) => a.id)),
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
        <AttachmentFilter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          labels={{
            mimeType: t("filters.mimeType"),
            uploader: t("filters.uploader"),
            allVisibility: t("filters.allVisibility"),
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
      ) : attachments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noAttachments")}
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
                <TableHead className="w-36">{t("columns.bizType")}</TableHead>
                <TableHead className="w-36">{t("columns.bizId")}</TableHead>
                <TableHead className="w-36">{t("columns.createdBy")}</TableHead>
                <TableActionHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachments.map((attachment) => (
                <TableRow
                  key={attachment.id}
                  data-selected={selectedIds.has(attachment.id)}
                >
                  <TableCell sticky="left">
                    <Checkbox
                      checked={selectedIds.has(attachment.id)}
                      onCheckedChange={() => toggleOne(attachment.id)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(attachment.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {attachment.upload.mimeType}
                  </TableCell>
                  <TableCell>{formatBytes(attachment.upload.size)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        attachment.visibility === "public"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {attachment.visibility}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {attachment.bizType}
                  </TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[100px]">
                    {attachment.bizId}
                  </TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[100px]">
                    {attachment.createdBy}
                  </TableCell>
                  <TableActionCell
                    menuLabel={t("columns.actions")}
                    menu={
                      <>
                        <DropdownMenuItem
                          onClick={() => handleViewFile(attachment)}
                        >
                          <Eye />
                          {t("viewFile")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDetailAttachment(attachment)}
                        >
                          <Info />
                          {t("detail")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setReplaceAttachment(attachment)}
                        >
                          <Replace />
                          {t("replace")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleSingleDelete(attachment)}
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
                        aria-label={t("viewFile")}
                        tooltip={t("viewFile")}
                        onClick={() => handleViewFile(attachment)}
                      >
                        <Eye />
                      </TooltipButton>
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("detail")}
                        tooltip={t("detail")}
                        onClick={() => setDetailAttachment(attachment)}
                      >
                        <Info />
                      </TooltipButton>
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("replace")}
                        tooltip={t("replace")}
                        onClick={() => setReplaceAttachment(attachment)}
                      >
                        <Replace />
                      </TooltipButton>
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        tooltip={t("delete")}
                        onClick={() => handleSingleDelete(attachment)}
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
      <AttachmentDetailDialog
        open={!!detailAttachment}
        attachment={detailAttachment}
        onOpenChange={(open) => !open && setDetailAttachment(null)}
      />
      <AttachmentReplaceDialog
        open={!!replaceAttachment}
        attachment={replaceAttachment}
        onOpenChange={(open) => !open && setReplaceAttachment(null)}
        onReplaced={fetchAttachments}
      />
      <AttachmentDownloadDialog
        open={!!downloadAttachment}
        attachment={downloadAttachment}
        onOpenChange={(open) => !open && setDownloadAttachment(null)}
      />
    </div>
  );
}
