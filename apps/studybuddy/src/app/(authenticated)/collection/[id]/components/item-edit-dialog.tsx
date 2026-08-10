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
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface ItemEditDialogProps {
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: {
    title: string | null;
    note: string | null;
    tags: string[];
    status: string;
    url: string | null;
  };
  onSaved: () => void;
}

const STATUS_OPTIONS = ["active", "archived", "learned"] as const;

export function ItemEditDialog({
  itemId,
  open,
  onOpenChange,
  initial,
  onSaved,
}: ItemEditDialogProps) {
  const t = useTranslations("Collection");
  const [title, setTitle] = useState(initial.title ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [url, setUrl] = useState(initial.url ?? "");
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [status, setStatus] = useState(initial.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial.title ?? "");
    setNote(initial.note ?? "");
    setUrl(initial.url ?? "");
    setTags(initial.tags.join(", "));
    setStatus(initial.status);
  }, [open, initial]);

  function reset() {
    setTitle("");
    setNote("");
    setUrl("");
    setTags("");
    setStatus("active");
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await withApiFeedback(
        appClient.api.collection.items[":id"].$patch,
      )({
        param: { id: itemId },
        json: {
          title: title.trim() || null,
          note: note.trim() || null,
          url: url.trim() || null,
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          status: status as (typeof STATUS_OPTIONS)[number],
        },
      });
      if (!res.ok) return;
      toast.success(t("updateSuccess"));
      onSaved();
      handleClose(false);
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="item-edit-form"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="item-title">
                  {t("fields.title")}
                </FieldLabel>
                <Input
                  id="item-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-note">{t("fields.note")}</FieldLabel>
                <Textarea
                  id="item-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-url">{t("fields.url")}</FieldLabel>
                <Input
                  id="item-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-tags">{t("fields.tags")}</FieldLabel>
                <Input
                  id="item-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t("fields.status")}</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant={status === opt ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatus(opt)}
                    >
                      {t(`status.${opt}`)}
                    </Button>
                  ))}
                </div>
              </Field>
            </FieldGroup>
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
          <Button type="submit" form="item-edit-form" disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
