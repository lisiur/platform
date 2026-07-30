"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FieldGroup,
} from "@repo/ui";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfigField } from "@/app/(authenticated)/settings/components/config-field";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface ConfigItem {
  id: string;
  appId: string;
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

interface ApplicationAiAgentFormProps {
  appId: string;
}

export function ApplicationAiAgentForm({ appId }: ApplicationAiAgentFormProps) {
  const t = useTranslations("Settings");
  const ta = useTranslations("Applications");
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await withApiFeedback(
          appClient.api.applications[":id"].config[":group"].$get,
        )({
          param: { id: appId, group: "ai-agent" },
        });
        const data = await res.json();
        // `allowedApis` is managed by the dedicated AllowedApiSelector below.
        setItems(
          (data as ConfigItem[]).filter(
            (item) => item.key !== "allowedApis" && item.key !== "systemPrompt",
          ),
        );
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [appId]);

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
      const dirty = form.formState.dirtyFields as Record<string, boolean>;
      const payload = items
        .filter((item) => dirty[item.key])
        .map((item) => ({
          group: item.group,
          key: item.key,
          value: form.getValues(item.key),
          schema:
            (item.schema as Record<string, unknown> | undefined) ?? undefined,
          type: item.type as "string" | "number" | "boolean" | "json",
          label: item.label,
          description: item.description ?? undefined,
          isSecret: item.isSecret,
          mask: item.mask ?? undefined,
          sortOrder: item.sortOrder,
        }));
      await withApiFeedback(appClient.api.applications[":id"].config.$put)({
        param: { id: appId },
        json: { items: payload },
      });
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{ta("aiAgentTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
          {items.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>{ta("noAiAgentConfigurableSettings")}</span>
            </div>
          ) : null}
          <FieldGroup>
            {items.map((item) => (
              <ConfigField key={item.key} item={item} control={form.control} />
            ))}
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || items.length === 0}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
