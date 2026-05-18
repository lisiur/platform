"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { appClient } from "@/lib/api";
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
  isSecret: boolean;
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
        const res = await appClient.api["system-config"][":group"].$get({
          param: {
            group,
          },
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setItems(data);
      } catch {
        toast.error(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [group, t]);

  const schema = z.object(
    Object.fromEntries(items.map((item) => [item.key, z.string()])),
  );

  const form = useForm({
    resolver: zodResolver(schema),
    values: Object.fromEntries(items.map((item) => [item.key, item.value])),
  });

  async function handleSave() {
    setSaving(true);
    try {
      const payload = items.map((item) => ({
        group: item.group,
        key: item.key,
        value: form.getValues(item.key),
        type: item.type as "string" | "number" | "boolean" | "json",
        label: item.label,
        description: item.description ?? undefined,
        isSecret: item.isSecret,
        sortOrder: item.sortOrder,
      }));
      const res = await appClient.api["system-config"].batch.$put({
        json: {
          items: payload,
        },
      });
      if (!res.ok) throw new Error("Failed to save");
      for (const item of payload) {
        updateConfig(item.group, item.key, item.value);
      }
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveFailed"));
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
      {items.map((item) => (
        <ConfigField key={item.key} item={item} control={form.control} />
      ))}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
