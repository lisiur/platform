"use client";

import { useEffect, useState } from "react";

/** Resolved AI Agent visual config: which chat UI parts the user sees. */
export interface AgentUiConfig {
  /** Show the reasoning panel (structured parts + `<think>` blocks). */
  showReasoning: boolean;
  /** Show the generic fallback tool-call card. Interactive cards always show. */
  showToolCalls: boolean;
}

export interface UseAgentConfigOptions {
  /** API origin, e.g. window.location.origin. */
  apiOrigin: string;
  /** App code sent as the `X-App-Code` header. */
  appCode: string;
}

export interface AgentConfigApi {
  /** Resolved visual config; both flags default to `false` while loading. */
  config: AgentUiConfig;
  /** True until the first resolve (cached or fetched). */
  loading: boolean;
}

// Effective default before the first resolve: hide everything, matching the
// server default (reasoning hidden, tool cards hidden) so there is no flash
// of shown content on cold mount.
const DEFAULT_CONFIG: AgentUiConfig = {
  showReasoning: false,
  showToolCalls: false,
};

// Module-level cache keyed by appCode. The visual config is app-scoped
// (DB + env fallback), so it is fetched once per app and shared across
// session switches and panel remounts. Concurrent callers de-dupe via
// `inFlight` so only one request is sent.
const cache = new Map<string, AgentUiConfig>();
const inFlight = new Map<string, Promise<AgentUiConfig>>();

function fetchConfig(
  apiOrigin: string,
  appCode: string,
): Promise<AgentUiConfig> {
  const existing = inFlight.get(appCode);
  if (existing) return existing;
  const promise = fetch(`${apiOrigin}/api/agent/config`, {
    credentials: "include",
    headers: { "X-App-Code": appCode },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`agent config fetch failed: ${res.status}`);
      return res.json() as Promise<Partial<AgentUiConfig>>;
    })
    .then((data): AgentUiConfig => {
      const value: AgentUiConfig = {
        showReasoning: data?.showReasoning !== false,
        showToolCalls: data?.showToolCalls !== false,
      };
      cache.set(appCode, value);
      inFlight.delete(appCode);
      return value;
    })
    .catch(() => {
      // Fail open: return the default so chat isn't blocked, but don't cache it
      // — a transient failure (e.g. 500 / network blip) shouldn't permanently
      // ignore the admin's hidden-reasoning/tool-calls setting. The next mount
      // sees no cache entry and retries.
      inFlight.delete(appCode);
      return DEFAULT_CONFIG;
    });
  inFlight.set(appCode, promise);
  return promise;
}

/**
 * Resolves the calling app's AI Agent visual config. Cached at module scope
 * per app, so only the first mount fetches. Both flags default to `true`
 * (shown) until resolved.
 */
export function useAgentConfig({
  apiOrigin,
  appCode,
}: UseAgentConfigOptions): AgentConfigApi {
  const [config, setConfig] = useState<AgentUiConfig>(
    () => cache.get(appCode) ?? DEFAULT_CONFIG,
  );
  const [loading, setLoading] = useState(() => !cache.has(appCode));

  useEffect(() => {
    if (cache.has(appCode)) {
      setConfig(cache.get(appCode) ?? DEFAULT_CONFIG);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchConfig(apiOrigin, appCode).then((value) => {
      if (cancelled) return;
      setConfig(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apiOrigin, appCode]);

  return {
    config,
    loading,
  };
}
