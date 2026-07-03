"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatDateTime } from "@/utils/date";
import { formatBytes } from "@/utils/format";
import type { UploadEntry } from "./upload-table";

interface UploadDetailDialogProps {
  open: boolean;
  upload: UploadEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function UploadDetailDialog({
  open,
  upload,
  onOpenChange,
}: UploadDetailDialogProps) {
  const t = useTranslations("Uploads");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {upload ? (
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <DetailRow label={t("columns.id")} value={upload.id} mono />
              <DetailRow
                label={t("columns.path")}
                value={upload.path}
                mono
                colSpan={2}
              />
              <DetailRow
                label={t("columns.mimeType")}
                value={upload.mimeType}
              />
              <DetailRow
                label={t("columns.size")}
                value={formatBytes(upload.size)}
              />
              <DetailRow
                label={t("columns.visibility")}
                value={
                  <Badge
                    variant={
                      upload.visibility === "public" ? "secondary" : "outline"
                    }
                  >
                    {upload.visibility}
                  </Badge>
                }
              />
              <DetailRow
                label={t("columns.uploader")}
                value={`${upload.uploader.name} (${upload.uploader.email})`}
                colSpan={2}
              />
              <DetailRow
                label={t("columns.createdAt")}
                value={formatDateTime(upload.createdAt)}
                colSpan={3}
              />
            </dl>
          ) : (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
  colSpan,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  colSpan?: number;
}) {
  return (
    <>
      <dt
        className={
          colSpan === 2
            ? "text-muted-foreground"
            : "text-muted-foreground col-span-3 sm:col-span-1"
        }
      >
        {label}
      </dt>
      <dd
        className={`break-all ${mono ? "font-mono text-xs" : ""} ${
          colSpan === 2 ? "col-span-2" : "col-span-3 sm:col-span-2"
        }`}
      >
        {value}
      </dd>
    </>
  );
}
