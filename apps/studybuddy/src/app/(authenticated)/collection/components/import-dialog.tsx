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
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

const MAX_ITEMS = 1000;

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: ImportDialogProps) {
  const t = useTranslations("Collection");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<unknown[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function reset() {
    setFileName("");
    setItems(null);
    setError(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      reset();
      return;
    }
    setFileName(file.name);
    try {
      const parsed = JSON.parse(await file.text());
      if (
        !parsed ||
        !Array.isArray(parsed.items) ||
        parsed.items.length === 0
      ) {
        throw new Error("invalid");
      }
      if (parsed.items.length > MAX_ITEMS) {
        setItems(null);
        setError(t("importTooMany", { count: MAX_ITEMS }));
        return;
      }
      setItems(parsed.items);
      setError(null);
    } catch {
      setItems(null);
      setError(t("importInvalidFile"));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items) return;
    setImporting(true);
    try {
      const res = await withApiFeedback(
        appClient.api.collection.items.import.$post,
      )({ json: { items: items as never } });
      if (!res.ok) return;
      const data = await res.json();
      toast.success(
        t("importSuccess", { created: data.created, skipped: data.skipped }),
      );
      onImported();
      handleClose(false);
    } catch {
      // Error handled by API feedback.
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("import")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="collection-import-form"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="collection-import-file">
                {t("importFileLabel")}
              </FieldLabel>
              <Input
                id="collection-import-file"
                type="file"
                accept=".json,application/json"
                aria-invalid={!!error}
                onChange={handleFileChange}
              />
              {fileName && !error && items ? (
                <p className="text-sm text-muted-foreground">
                  {t("importItemsFound", { count: items.length })}
                </p>
              ) : null}
              <FieldError errors={error ? [{ message: error }] : undefined} />
            </Field>
          </form>
        </DialogBody>
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
            form="collection-import-form"
            disabled={importing || !items}
          >
            {importing ? t("importing") : t("import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
