"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@repo/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface UploadDownloadDialogProps {
  open: boolean;
  upload: { id: string; path: string; visibility: string } | null;
  onOpenChange: (open: boolean) => void;
}

export function UploadDownloadDialog({
  open,
  upload,
  onOpenChange,
}: UploadDownloadDialogProps) {
  const t = useTranslations("Uploads");
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!upload) return;
    setDownloading(true);
    try {
      let url = `/api/upload/${upload.id}`;
      if (upload.visibility === "private") {
        const res = await withApiFeedback(
          appClient.api.upload[":id"].sign.$post,
        )({
          param: { id: upload.id },
        });
        const data = await res.json();
        url = data.url;
      }
      const link = document.createElement("a");
      link.href = `${window.location.origin}${url}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      onOpenChange(false);
    } catch {
      // Error handled by API feedback.
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("downloadTitle")}</DialogTitle>
          {upload && <DialogDescription>{upload.path}</DialogDescription>}
        </DialogHeader>
        <DialogBody>
          <p className="text-muted-foreground text-sm">{t("downloadHint")}</p>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Spinner /> : <Download className="h-4 w-4" />}
            {t("download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
