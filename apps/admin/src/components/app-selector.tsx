"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface AppOption {
  id: string;
  name: string;
  code: string;
}

interface AppSelectorProps {
  value?: string;
  onChange: (appId: string) => void;
}

export function AppSelector({ value, onChange }: AppSelectorProps) {
  const t = useTranslations("Applications");
  const [apps, setApps] = useState<AppOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await withApiFeedback(appClient.api.applications.$get)({
          query: { limit: 100, offset: 0 },
        });
        const data = await res.json();
        if (cancelled) return;
        setApps(data.applications);
      } catch {
        if (!cancelled) setApps([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!value && apps.length > 0) {
      onChange(apps[0].id);
    }
  }, [value, apps, onChange]);

  const selected = apps.find((app) => app.id === value);

  return (
    <Select
      value={value ?? ""}
      onValueChange={(val) => onChange(val as string)}
    >
      <SelectTrigger className="h-9 w-60">
        <SelectValue>
          {loading ? t("name") : (selected?.name ?? t("noApps"))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {apps.map((app) => (
          <SelectItem key={app.id} value={app.id}>
            {app.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
