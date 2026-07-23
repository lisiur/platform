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
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
  Switch,
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

const PRIORITY_OPTIONS = ["CRITICAL", "HIGH", "NORMAL", "LOW", "IDLE"] as const;

export interface JobTemplateInitialValues {
  id?: string;
  name: string;
  type: string;
  description?: string;
  cronExpression?: string | null;
  enabled: boolean;
  priority: string;
  maxAttempts: number;
  timeoutMs: number;
  payload?: unknown;
}

interface JobTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initialValues?: JobTemplateInitialValues | null;
}

export function JobTemplateDialog({
  open,
  onOpenChange,
  onSaved,
  initialValues,
}: JobTemplateDialogProps) {
  const t = useTranslations("Jobs");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState<string>("NORMAL");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [timeoutMs, setTimeoutMs] = useState("60000");
  const [payload, setPayload] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!initialValues?.id;

  function resetForm() {
    setName("");
    setType("");
    setDescription("");
    setCronExpression("");
    setEnabled(true);
    setPriority("NORMAL");
    setMaxAttempts("3");
    setTimeoutMs("60000");
    setPayload("");
    setErrors({});
  }

  useEffect(() => {
    if (open && initialValues) {
      setName(initialValues.name);
      setType(initialValues.type);
      setDescription(initialValues.description ?? "");
      setCronExpression(initialValues.cronExpression ?? "");
      setEnabled(initialValues.enabled);
      setPriority(initialValues.priority);
      setMaxAttempts(String(initialValues.maxAttempts));
      setTimeoutMs(String(initialValues.timeoutMs));
      setPayload(
        initialValues.payload != null
          ? JSON.stringify(initialValues.payload, null, 2)
          : "",
      );
      setErrors({});
    }
  }, [open, initialValues]);

  function handleClose(open: boolean) {
    if (!open) resetForm();
    onOpenChange(open);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = t("form.namePlaceholder");
    if (!type.trim()) newErrors.type = t("form.typePlaceholder");

    let parsedPayload: unknown = null;
    if (payload.trim()) {
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        newErrors.payload = t("form.payloadInvalid");
      }
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      const json = {
        name: name.trim(),
        type: type.trim(),
        description: description.trim() || undefined,
        cronExpression: cronExpression.trim() || undefined,
        enabled,
        priority: priority as "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | "IDLE",
        maxAttempts: Number(maxAttempts),
        timeoutMs: Number(timeoutMs),
        payload: parsedPayload,
      };

      if (isEdit && initialValues?.id) {
        await withApiFeedback(appClient.api.jobs[":id"].$patch)({
          param: { id: initialValues.id },
          json,
        });
        toast.success(t("updateSuccess"));
      } else {
        await withApiFeedback(appClient.api.jobs.$post)({ json });
        toast.success(t("createSuccess"));
      }
      handleClose(false);
      onSaved();
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editTemplate") : t("addTemplate")}
          </DialogTitle>
        </DialogHeader>
        <form id="job-template-form" onSubmit={handleSubmit}>
          <DialogBody>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tpl-name">{t("form.name")}</FieldLabel>
                <Input
                  id="tpl-name"
                  placeholder={t("form.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <FieldDescription>{t("form.nameDescription")}</FieldDescription>
                {errors.name && <FieldError>{errors.name}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="tpl-type">{t("form.type")}</FieldLabel>
                <Input
                  id="tpl-type"
                  placeholder={t("form.typePlaceholder")}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  required
                />
                <FieldDescription>{t("form.typeDescription")}</FieldDescription>
                {errors.type && <FieldError>{errors.type}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="tpl-description">
                  {t("form.description")}
                </FieldLabel>
                <Textarea
                  id="tpl-description"
                  placeholder={t("form.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-16 text-sm"
                />
                <FieldDescription>
                  {t("form.descriptionDescription")}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="tpl-cron">
                  {t("form.cronExpression")}
                </FieldLabel>
                <Input
                  id="tpl-cron"
                  placeholder={t("form.cronExpressionPlaceholder")}
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="font-mono"
                />
                <FieldDescription>
                  {t("form.cronExpressionDescription")}
                </FieldDescription>
              </Field>

              <Field orientation="horizontal">
                <Field>
                  <FieldLabel htmlFor="tpl-priority">
                    {t("form.priority")}
                  </FieldLabel>
                  <Select
                    value={priority}
                    onValueChange={(v: string | null) =>
                      setPriority(v ?? "NORMAL")
                    }
                  >
                    <SelectTrigger id="tpl-priority">
                      {t(`priority.${priority}`)}
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {t(`priority.${p}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tpl-enabled">
                    {t("form.enabled")}
                  </FieldLabel>
                  <div className="flex h-9 items-center">
                    <Switch
                      id="tpl-enabled"
                      checked={enabled}
                      onCheckedChange={setEnabled}
                    />
                  </div>
                  <FieldDescription>
                    {t("form.enabledDescription")}
                  </FieldDescription>
                </Field>
              </Field>

              <Field orientation="horizontal">
                <Field>
                  <FieldLabel htmlFor="tpl-maxAttempts">
                    {t("form.maxAttempts")}
                  </FieldLabel>
                  <Input
                    id="tpl-maxAttempts"
                    type="number"
                    min={1}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                  />
                  <FieldDescription>
                    {t("form.maxAttemptsDescription")}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tpl-timeoutMs">
                    {t("form.timeoutMs")}
                  </FieldLabel>
                  <Input
                    id="tpl-timeoutMs"
                    type="number"
                    min={1}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(e.target.value)}
                  />
                  <FieldDescription>
                    {t("form.timeoutMsDescription")}
                  </FieldDescription>
                </Field>
              </Field>

              <Field>
                <FieldLabel htmlFor="tpl-payload">
                  {t("form.payload")}
                </FieldLabel>
                <Textarea
                  id="tpl-payload"
                  placeholder={t("form.payloadPlaceholder")}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="min-h-24 font-mono text-xs"
                />
                <FieldDescription>
                  {t("form.payloadDescription")}
                </FieldDescription>
                {errors.payload && <FieldError>{errors.payload}</FieldError>}
              </Field>
            </FieldGroup>
          </DialogBody>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
          >
            {t("cancelBtn")}
          </Button>
          <Button type="submit" form="job-template-form" disabled={saving}>
            {saving ? <Spinner /> : null}
            {saving ? t("creating") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
