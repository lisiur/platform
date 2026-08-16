"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Switch,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

export interface OverrideRow {
  id: string;
  subject: string;
  type: "ip" | "user";
  max: number | null;
  windowMs: number | null;
  bypass: boolean;
  note: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OverrideDialogProps {
  override?: OverrideRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type FormValues = {
  type: "ip" | "user";
  value: string;
  bypass: boolean;
  max: string;
  windowMs: string;
  note: string;
  startAt: string;
  endAt: string;
};

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function OverrideDialog({
  override,
  open,
  onOpenChange,
  onSuccess,
}: OverrideDialogProps) {
  const t = useTranslations("RateLimit");
  const isEdit = !!override;

  const schema = z.object({
    type: z.enum(["ip", "user"]),
    value: z.string().min(1),
    bypass: z.boolean(),
    max: z.string(),
    windowMs: z.string(),
    note: z.string(),
    startAt: z.string(),
    endAt: z.string(),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: override?.type ?? "ip",
      value: override ? override.subject.split(":").slice(1).join(":") : "",
      bypass: override?.bypass ?? false,
      max: override?.max != null ? String(override.max) : "",
      windowMs: override?.windowMs != null ? String(override.windowMs) : "",
      note: override?.note ?? "",
      startAt: isoToLocalInput(override?.startAt ?? null),
      endAt: isoToLocalInput(override?.endAt ?? null),
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        type: override?.type ?? "ip",
        value: override ? override.subject.split(":").slice(1).join(":") : "",
        bypass: override?.bypass ?? false,
        max: override?.max != null ? String(override.max) : "",
        windowMs: override?.windowMs != null ? String(override.windowMs) : "",
        note: override?.note ?? "",
        startAt: isoToLocalInput(override?.startAt ?? null),
        endAt: isoToLocalInput(override?.endAt ?? null),
      });
    }
  }, [open, override, reset]);

  const bypass = watch("bypass");
  const type = watch("type");

  async function onSubmit(data: FormValues) {
    const subject = isEdit
      ? override.subject
      : `${data.type}:${data.value.trim()}`;
    const json = {
      type: isEdit ? override.type : data.type,
      bypass: data.bypass,
      max: data.bypass ? null : toNumberOrNull(data.max),
      windowMs: data.bypass ? null : toNumberOrNull(data.windowMs),
      note: data.note.trim() || null,
      startAt: localInputToIso(data.startAt),
      endAt: localInputToIso(data.endAt),
    };

    try {
      await withApiFeedback(
        appClient.api["rate-limit"].overrides[":subject"].$put,
      )({ param: { subject }, json });
      reset();
      onSuccess();
    } catch {
      // Error handled by API feedback.
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("overrides.edit") : t("overrides.add")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("overrides.editDescription")
              : t("overrides.addDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="override-dialog-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="override-type">
                  {t("overrides.type")}
                </FieldLabel>
                {isEdit ? (
                  <Input id="override-type" value={override.type} disabled />
                ) : (
                  <Select
                    value={type}
                    onValueChange={(v) =>
                      setValue("type", v as "ip" | "user", {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="override-type">
                      {type === "ip"
                        ? t("dialog.typeIp")
                        : t("dialog.typeUser")}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ip">{t("dialog.typeIp")}</SelectItem>
                      <SelectItem value="user">
                        {t("dialog.typeUser")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {!isEdit && (
                <Field>
                  <FieldLabel htmlFor="override-value" required>
                    {t("dialog.value")}
                  </FieldLabel>
                  <Input
                    id="override-value"
                    placeholder={
                      type === "ip"
                        ? t("dialog.valueIpPlaceholder")
                        : t("dialog.valueUserPlaceholder")
                    }
                    aria-invalid={!!errors.value}
                    {...register("value")}
                  />
                  <FieldError
                    errors={errors.value ? [errors.value] : undefined}
                  />
                </Field>
              )}

              <Field orientation="horizontal" className="gap-2">
                <Switch
                  id="override-bypass"
                  checked={bypass}
                  onCheckedChange={(v) =>
                    setValue("bypass", v === true, { shouldValidate: true })
                  }
                />
                <div>
                  <FieldLabel htmlFor="override-bypass" className="font-normal">
                    {t("dialog.bypass")}
                  </FieldLabel>
                  <FieldDescription>{t("dialog.bypassHint")}</FieldDescription>
                </div>
              </Field>

              {!bypass && (
                <>
                  <Field>
                    <FieldLabel htmlFor="override-max">
                      {t("dialog.max")}
                    </FieldLabel>
                    <Input
                      id="override-max"
                      type="number"
                      inputMode="numeric"
                      {...register("max")}
                    />
                    <FieldDescription>{t("dialog.maxHint")}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="override-window">
                      {t("dialog.windowMs")}
                    </FieldLabel>
                    <Input
                      id="override-window"
                      type="number"
                      inputMode="numeric"
                      {...register("windowMs")}
                    />
                    <FieldDescription>
                      {t("dialog.windowMsHint")}
                    </FieldDescription>
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel htmlFor="override-note">
                  {t("overrides.note")}
                </FieldLabel>
                <Input
                  id="override-note"
                  placeholder={t("dialog.notePlaceholder")}
                  {...register("note")}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="override-start">
                  {t("dialog.startAt")}
                </FieldLabel>
                <Input
                  id="override-start"
                  type="datetime-local"
                  {...register("startAt")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="override-end">
                  {t("dialog.endAt")}
                </FieldLabel>
                <Input
                  id="override-end"
                  type="datetime-local"
                  {...register("endAt")}
                />
                <FieldDescription>{t("dialog.timeRangeHint")}</FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("dialog.cancel")}
          </Button>
          <Button
            type="submit"
            form="override-dialog-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("dialog.saving") : t("dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
