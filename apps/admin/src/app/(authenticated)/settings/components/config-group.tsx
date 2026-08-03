"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FieldGroup } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { useSystemConfigStore } from "@/stores/system-config-store";
import { ConfigField } from "./config-field";

interface ConfigItem {
  id: string;
  group: string;
  key: string;
  value: string;
  type: string;
  label: string;
  description?: string | null;
  schema?: unknown | null;
  isSecret: boolean;
  mask?: string | null;
  sortOrder: number;
}

interface ConfigGroupProps {
  group: string;
}

export function ConfigGroup({ group }: ConfigGroupProps) {
  const t = useTranslations("Settings");
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const updateConfig = useSystemConfigStore((s) => s.updateConfig);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await withApiFeedback(
          appClient.api["system-config"][":group"].$get,
        )({
          param: {
            group,
          },
        });
        const data = await res.json();
        setItems(data);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [group]);

  const schema = useMemo(
    () =>
      z.object(Object.fromEntries(items.map((item) => [item.key, z.string()]))),
    [items],
  );

  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
  });

  const { reset } = form;

  useEffect(() => {
    if (items.length > 0) {
      reset(Object.fromEntries(items.map((item) => [item.key, item.value])));
    }
  }, [items, reset]);

  const { isDirty } = form.formState;

  async function handleSave() {
    setSaving(true);
    try {
      const currentValues = Object.fromEntries(
        items.map((item) => [item.key, form.getValues(item.key)]),
      );
      const payload = items
        .filter((item) => currentValues[item.key] !== item.value)
        .map((item) => ({
          group: item.group,
          key: item.key,
          value: currentValues[item.key],
          schema:
            (item.schema as Record<string, unknown> | undefined) ?? undefined,
          type: item.type as "string" | "number" | "boolean" | "json",
          label: item.label,
          description: item.description ?? undefined,
          isSecret: item.isSecret,
          mask: item.mask ?? undefined,
          sortOrder: item.sortOrder,
        }));
      if (payload.length === 0) {
        return;
      }
      await withApiFeedback(appClient.api["system-config"].batch.$put)({
        json: {
          items: payload,
        },
      });
      for (const item of payload) {
        updateConfig(item.group, item.key, item.value);
      }
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          value: currentValues[it.key] ?? it.value,
        })),
      );
      toast.success(t("saveSuccess"));
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
      <fieldset disabled={saving} className="space-y-6">
        <FieldGroup>
          {items.map((item) => (
            <ConfigField key={item.key} item={item} control={form.control} />
          ))}
        </FieldGroup>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !isDirty}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
