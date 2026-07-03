"use client";

import { Watermark, type WatermarkConfig } from "@repo/frontend";
import { useMemo } from "react";
import { useCurrentApp } from "@/hooks/use-current-app";
import { useSession } from "@/lib/api";

export function AppWatermark() {
  const { app } = useCurrentApp();
  const { data: session } = useSession();

  const config = useMemo<WatermarkConfig | null>(() => {
    if (!app) return null;
    let parsed: Partial<WatermarkConfig> = {};
    if (app.watermarkConfig) {
      try {
        parsed = JSON.parse(app.watermarkConfig) as Partial<WatermarkConfig>;
      } catch {
        parsed = {};
      }
    }
    return {
      enabled: app.watermarkEnabled,
      content: parsed.content?.trim() ? parsed.content : "{name}",
    };
  }, [app]);

  const variables = useMemo<Record<string, string>>(() => {
    const name = session?.user.name ?? "";
    const email = session?.user.email ?? "";
    return { name, email };
  }, [session]);

  if (!config) return null;

  return <Watermark config={config} variables={variables} />;
}
