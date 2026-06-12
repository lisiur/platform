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
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@repo/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { isRecord } from "./notification-form-utils";
import type { NotificationChannel, NotificationTemplate } from "./types";

interface VariableRow {
  id: string;
  name: string;
  description: string;
  required: boolean;
}

interface NotificationTemplateDialogProps {
  template?: NotificationTemplate | null;
  channels: NotificationChannel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function parseVariablesSchema(schema: unknown): VariableRow[] {
  if (!isRecord(schema)) return [];

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  );

  return Object.entries(properties)
    .filter(([, property]) => isRecord(property))
    .map(([name, property]) => ({
      id: crypto.randomUUID(),
      name,
      description:
        isRecord(property) && typeof property.description === "string"
          ? property.description
          : "",
      required: required.has(name),
    }));
}

function buildVariablesSchema(rows: VariableRow[]) {
  const required = rows.filter((row) => row.required).map((row) => row.name);

  const properties: Record<string, { type: string; description?: string }> = {};
  for (const row of rows) {
    properties[row.name] = {
      type: "string",
      ...(row.description ? { description: row.description } : {}),
    };
  }

  return { properties, ...(required.length > 0 ? { required } : {}) };
}

export function NotificationTemplateDialog({
  template,
  channels,
  open,
  onOpenChange,
  onSuccess,
}: NotificationTemplateDialogProps) {
  const t = useTranslations("Notifications");
  const isEdit = !!template;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [channelId, setChannelId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [variableRows, setVariableRows] = useState<VariableRow[]>([]);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setKey(template?.key ?? "");
    setChannelId(template?.channelId ?? channels[0]?.id ?? "");
    setEnabled(template?.enabled ?? true);
    setSubjectTemplate(template?.subjectTemplate ?? "");
    setTitleTemplate(template?.titleTemplate ?? "");
    setBodyTemplate(template?.bodyTemplate ?? "");
    setVariableRows(parseVariablesSchema(template?.variablesSchema));
  }, [channels, open, template]);

  function getChannelLabel(id: string) {
    const channel = channels.find((item) => item.id === id);
    if (!channel) return t("templates.selectChannel");
    return `${channel.name} (${channel.providerKey})`;
  }

  function handleChannelChange(nextChannelId: string | null) {
    if (!nextChannelId) return;
    setChannelId(nextChannelId);
  }

  function addVariableRow() {
    setVariableRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        required: true,
      },
    ]);
  }

  function removeVariableRow(id: string) {
    setVariableRows((prev) => prev.filter((row) => row.id !== id));
  }

  function updateVariableRow(id: string, patch: Partial<VariableRow>) {
    setVariableRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    setSaving(true);
    try {
      const activeRows = variableRows.filter((row) => row.name.trim());
      const payload = {
        name,
        key,
        channelId,
        enabled,
        subjectTemplate: subjectTemplate || null,
        titleTemplate: titleTemplate || null,
        bodyTemplate,
        variablesSchema:
          activeRows.length > 0 ? buildVariablesSchema(activeRows) : undefined,
      };

      if (isEdit) {
        await withApiFeedback(
          appClient.api["notification-templates"][":id"].$put,
        )({
          param: { id: template.id },
          json: payload,
        });
      } else {
        await withApiFeedback(appClient.api["notification-templates"].$post)({
          json: payload,
        });
      }
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEdit ? t("templates.edit") : t("templates.create")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("templates.editDescription")
              : t("templates.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="template-name">
                    {t("fields.name")}
                  </FieldLabel>
                  <Input
                    id="template-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-key">
                    {t("fields.key")}
                  </FieldLabel>
                  <Input
                    id="template-key"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>{t("fields.channel")}</FieldLabel>
                  <Select value={channelId} onValueChange={handleChannelChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{getChannelLabel(channelId)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.name} ({channel.providerKey})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field orientation="horizontal" className="justify-between">
                <div className="space-y-1">
                  <FieldLabel htmlFor="template-enabled">
                    {t("fields.enabled")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("templates.enabledDescription")}
                  </FieldDescription>
                </div>
                <Switch
                  id="template-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="template-subject">
                    {t("fields.subjectTemplate")}
                  </FieldLabel>
                  <Input
                    id="template-subject"
                    value={subjectTemplate}
                    onChange={(event) => setSubjectTemplate(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-title">
                    {t("fields.titleTemplate")}
                  </FieldLabel>
                  <Input
                    id="template-title"
                    value={titleTemplate}
                    onChange={(event) => setTitleTemplate(event.target.value)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="template-body">
                  {t("fields.bodyTemplate")}
                </FieldLabel>
                <Textarea
                  id="template-body"
                  value={bodyTemplate}
                  onChange={(event) => setBodyTemplate(event.target.value)}
                  rows={5}
                  required
                />
                <FieldDescription>
                  {t("templates.variableHint")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("fields.variables")}</FieldLabel>
                <FieldDescription>
                  {t("templates.variableDescription")}
                </FieldDescription>
                <div className="space-y-3">
                  {variableRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-start gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <FieldLabel htmlFor={`var-name-${row.id}`}>
                              {t("fields.variableName")}
                            </FieldLabel>
                            <Input
                              id={`var-name-${row.id}`}
                              value={row.name}
                              onChange={(event) =>
                                updateVariableRow(row.id, {
                                  name: event.target.value,
                                })
                              }
                              placeholder="userName"
                            />
                          </div>
                          <div>
                            <FieldLabel htmlFor={`var-desc-${row.id}`}>
                              {t("fields.variableDescription")}
                            </FieldLabel>
                            <Input
                              id={`var-desc-${row.id}`}
                              value={row.description}
                              onChange={(event) =>
                                updateVariableRow(row.id, {
                                  description: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-5">
                        <label
                          htmlFor={`var-required-${row.id}`}
                          className="flex cursor-pointer items-center gap-1.5 text-sm"
                        >
                          <Switch
                            id={`var-required-${row.id}`}
                            checked={row.required}
                            onCheckedChange={(checked) =>
                              updateVariableRow(row.id, { required: checked })
                            }
                          />
                          {t("fields.variableRequired")}
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVariableRow(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addVariableRow}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("fields.addVariable")}
                  </Button>
                </div>
              </Field>
            </div>
          </form>
        </DialogBody>
        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("actions.cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || channels.length === 0}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
