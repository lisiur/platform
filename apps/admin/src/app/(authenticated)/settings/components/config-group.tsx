"use client";

import { Button, FieldGroup } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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

function getConfigFormValues(items: ConfigItem[]) {
  const values: Record<string, unknown> = {};

  for (const item of items) {
    const segments = item.key.split(".");
    let target = values;

    for (const segment of segments.slice(0, -1)) {
      if (!target[segment] || typeof target[segment] !== "object") {
        target[segment] = {};
      }
      target = target[segment] as Record<string, unknown>;
    }

    target[segments.at(-1) ?? item.key] = item.value;
  }

  return values as Record<string, string>;
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

  const values = useMemo(() => getConfigFormValues(items), [items]);

  const form = useForm<Record<string, string>>({
    values,
  });

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
