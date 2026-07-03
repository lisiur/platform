"use client";

import { useEffect, useRef, useState } from "react";
import { type WatermarkOptions, Watermark as WmPlus } from "watermark-js-plus";

export interface WatermarkConfig {
  enabled: boolean;
  content: string;
}

export interface WatermarkProps {
  config?: WatermarkConfig | null;
  variables?: Record<string, string>;
  parent?: Element | string;
}

const DEFAULTS = {
  rotate: 22,
  fontSize: "20px",
  fontWeight: "normal",
  zIndex: 9999,
};

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function resolveContent(
  content: string,
  variables?: Record<string, string>,
): string {
  if (!variables) return content;
  return content.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in variables ? variables[key] : `{${key}}`,
  );
}

function buildOptions(args: {
  parent: Element | string;
  content: string;
  fontColor: string;
}): Partial<WatermarkOptions> {
  return {
    parent: args.parent,
    contentType: "text",
    content: args.content,
    layout: "default",
    mutationObserve: false,
    monitorProtection: false,
    rotate: DEFAULTS.rotate,
    fontSize: DEFAULTS.fontSize,
    fontColor: args.fontColor,
    fontWeight: DEFAULTS.fontWeight,
    globalAlpha: 1,
    zIndex: DEFAULTS.zIndex,
  };
}

export function Watermark({
  config,
  variables,
  parent = "body",
}: WatermarkProps) {
  const instanceRef = useRef<WmPlus | null>(null);
  const isDark = useIsDarkMode();
  const fontColor = isDark
    ? "rgba(255, 255, 255, 0.03)"
    : "rgba(0, 0, 0, 0.03)";

  useEffect(() => {
    if (!config?.enabled || !config.content.trim()) {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      return;
    }

    const content = resolveContent(config.content, variables);
    const options = buildOptions({ parent, content, fontColor });

    if (instanceRef.current) {
      void instanceRef.current.changeOptions(options, "overwrite", true);
      return;
    }

    let cancelled = false;
    try {
      const instance = new WmPlus(options);
      instanceRef.current = instance;
      void instance.create().then(() => {
        if (cancelled) {
          instance.destroy();
          if (instanceRef.current === instance) {
            instanceRef.current = null;
          }
        }
      });
    } catch {
      instanceRef.current = null;
    }
    return () => {
      cancelled = true;
    };
  }, [config, variables, parent, fontColor]);

  useEffect(() => {
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  return null;
}
