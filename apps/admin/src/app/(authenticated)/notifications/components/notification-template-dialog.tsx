"use client";

import { isBuiltinNotification } from "@repo/shared";
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
  Tiptap,
} from "@repo/ui";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { appClient } from "@/lib/api";
import { uploadPublicFile } from "@/lib/api/upload-file";
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
  template: NotificationTemplate;
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

export function NotificationTemplateDialog({
  template,
  channels,
  open,
  onOpenChange,
  onSuccess,
}: NotificationTemplateDialogProps) {
  const t = useTranslations("Notifications");
  const builtin = isBuiltinNotification(template.flags);
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

  const selectedProviderKey = channels.find(
    (item) => item.id === channelId,
  )?.providerKey;
  const headlineField =
    selectedProviderKey === "smtp-email"
      ? "subject"
      : selectedProviderKey === "in-app"
        ? "title"
        : null;

  function getChannelLabel(id: string) {
    const channel = channels.find((item) => item.id === id);
    if (!channel) return t("templates.selectChannel");
    return `${channel.name} (${channel.providerKey})`;
  }

  function handleChannelChange(nextChannelId: string | null) {
    if (!nextChannelId) return;
    const nextProviderKey = channels.find(
      (item) => item.id === nextChannelId,
    )?.providerKey;
    const currentProviderKey = channels.find(
      (item) => item.id === channelId,
    )?.providerKey;
    setChannelId(nextChannelId);
    if (nextProviderKey !== currentProviderKey) {
      setSubjectTemplate("");
      setTitleTemplate("");
    }
  }

  async function handleSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        ...(key === template.key ? {} : { key }),
        ...(channelId === template.channelId ? {} : { channelId }),
        enabled,
        subjectTemplate: subjectTemplate || null,
        titleTemplate: titleTemplate || null,
        bodyTemplate,
      };

      await withApiFeedback(
        appClient.api["notification-templates"][":id"].$put,
      )({
        param: { id: template.id },
        json: payload,
      });
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("templates.edit")}</DialogTitle>
          <DialogDescription>
            {t("templates.editDescription")}
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
                    disabled={builtin}
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>{t("fields.channel")}</FieldLabel>
                  <Select
                    value={channelId}
                    onValueChange={handleChannelChange}
                    disabled={builtin}
                  >
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
              {headlineField === "subject" && (
                <Field>
                  <FieldLabel htmlFor="template-subject">
                    {t("fields.subjectTemplate")}
                  </FieldLabel>
                  <Input
                    id="template-subject"
                    value={subjectTemplate}
                    onChange={(event) => setSubjectTemplate(event.target.value)}
                    required
                  />
                </Field>
              )}
              {headlineField === "title" && (
                <Field>
                  <FieldLabel htmlFor="template-title">
                    {t("fields.titleTemplate")}
                  </FieldLabel>
                  <Input
                    id="template-title"
                    value={titleTemplate}
                    onChange={(event) => setTitleTemplate(event.target.value)}
                    required
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="template-body">
                  {t("fields.bodyTemplate")}
                </FieldLabel>
                {selectedProviderKey === "smtp-email" ? (
                  <Tiptap
                    id="template-body"
                    value={bodyTemplate}
                    onChange={setBodyTemplate}
                    variables={variableRows
                      .map((row) => row.name.trim())
                      .filter(Boolean)}
                    onUploadFile={uploadPublicFile}
                  />
                ) : (
                  <Textarea
                    id="template-body"
                    value={bodyTemplate}
                    onChange={(event) => setBodyTemplate(event.target.value)}
                    rows={5}
                    required
                  />
                )}
                <FieldDescription>
                  {t("templates.variableHint")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("fields.variables")}</FieldLabel>
                <FieldDescription>
                  {t("templates.variableDescription")}
                </FieldDescription>
                <div className="rounded-md border">
                  {variableRows.length === 0 ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">
                      —
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">
                            {t("fields.variableName")}
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            {t("fields.variableDescription")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {variableRows.map((row) => (
                          <tr key={row.id} className="border-b last:border-b-0">
                            <td className="px-3 py-2 font-mono text-sm">
                              {row.name}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {row.description || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
