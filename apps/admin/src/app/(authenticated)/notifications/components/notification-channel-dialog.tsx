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
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { ChannelConfigFields } from "./channel-config-fields";
import { getDefaultConfig, isRecord } from "./notification-form-utils";
import type { NotificationChannel, NotificationProvider } from "./types";

interface NotificationChannelDialogProps {
  channel?: NotificationChannel | null;
  providers: NotificationProvider[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NotificationChannelDialog({
  channel,
  providers,
  open,
  onOpenChange,
  onSuccess,
}: NotificationChannelDialogProps) {
  const t = useTranslations("Notifications");
  const isEdit = !!channel;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [providerKey, setProviderKey] = useState("in-app");
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.key === providerKey),
    [providers, providerKey],
  );

  useEffect(() => {
    if (!open) return;
    setName(channel?.name ?? "");
    setKey(channel?.key ?? "");
    setProviderKey(channel?.providerKey ?? providers[0]?.key ?? "in-app");
    setEnabled(channel?.enabled ?? true);
    setConfig(isRecord(channel?.config) ? channel.config : null);
  }, [channel, open, providers]);

  function handleProviderChange(nextProviderKey: string | null) {
    if (!nextProviderKey) return;
    setProviderKey(nextProviderKey);
    const provider = providers.find((item) => item.key === nextProviderKey);
    setConfig(getDefaultConfig(provider?.configSchema));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        key,
        providerKey,
        enabled,
        config: selectedProvider?.configSchema ? config : null,
      };

      if (isEdit) {
        await withApiFeedback(
          appClient.api["notification-channels"][":id"].$put,
        )({
          param: { id: channel.id },
          json: payload,
        });
      } else {
        await withApiFeedback(appClient.api["notification-channels"].$post)({
          json: payload,
        });
      }
      onSuccess();
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("channels.edit") : t("channels.create")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("channels.editDescription")
              : t("channels.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="notification-channel-dialog-form"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <Field>
              <FieldLabel htmlFor="channel-name">{t("fields.name")}</FieldLabel>
              <Input
                id="channel-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="channel-key">{t("fields.key")}</FieldLabel>
              <Input
                id="channel-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t("fields.provider")}</FieldLabel>
              <Select value={providerKey} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedProvider?.name ?? t("channels.selectProvider")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.key} value={provider.key}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProvider?.description && (
                <FieldDescription>
                  {selectedProvider.description}
                </FieldDescription>
              )}
            </Field>
            <Field orientation="horizontal" className="justify-between">
              <div className="space-y-1">
                <FieldLabel htmlFor="channel-enabled">
                  {t("fields.enabled")}
                </FieldLabel>
                <FieldDescription>
                  {t("channels.enabledDescription")}
                </FieldDescription>
              </div>
              <Switch
                id="channel-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </Field>
            <ChannelConfigFields
              schema={selectedProvider?.configSchema}
              value={config}
              onChange={setConfig}
            />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("actions.cancel")}
          </Button>
          <Button
            type="submit"
            form="notification-channel-dialog-form"
            disabled={saving}
          >
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
