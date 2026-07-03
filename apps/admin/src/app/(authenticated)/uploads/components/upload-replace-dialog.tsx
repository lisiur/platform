"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Spinner,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface UploadReplaceDialogProps {
  open: boolean;
  upload: { id: string; path: string; mimeType: string } | null;
  onOpenChange: (open: boolean) => void;
  onReplaced: () => void;
}

export function UploadReplaceDialog({
  open,
  upload,
  onOpenChange,
  onReplaced,
}: UploadReplaceDialogProps) {
  const t = useTranslations("Uploads");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleClose(open: boolean) {
    if (!open) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(open);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSelectedFile(file ?? null);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!upload || !selectedFile) return;
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.upload[":id"].replace.$put)({
        param: { id: upload.id },
        form: { file: selectedFile },
      } as Parameters<
        (typeof appClient.api.upload)[":id"]["replace"]["$put"]
      >[0]);
      toast.success(t("replaceSuccess"));
      handleClose(false);
      onReplaced();
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("replaceTitle")}</DialogTitle>
        </DialogHeader>
        <form id="upload-replace-form" onSubmit={handleSubmit}>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="replace-file">{t("chooseFile")}</FieldLabel>
              <input
                ref={fileInputRef}
                id="replace-file"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,application/pdf"
                className="text-sm"
                onChange={handleFileChange}
                required
              />
              <FieldDescription>{t("replaceHint")}</FieldDescription>
            </Field>
          </DialogBody>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="upload-replace-form"
            disabled={saving || !selectedFile}
          >
            {saving ? <Spinner /> : null}
            {saving ? t("replacing") : t("replace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
