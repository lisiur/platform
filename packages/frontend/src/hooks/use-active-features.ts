"use client";

import { useEffect, useState } from "react";

interface ActiveFeature {
  code: string;
  name: string;
}

interface UseActiveFeaturesResult {
  features: ActiveFeature[];
  loading: boolean;
  hasActiveFeature: (code: string) => boolean;
}

export function useActiveFeatures(apiOrigin: string): UseActiveFeaturesResult {
  const [features, setFeatures] = useState<ActiveFeature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiOrigin}/api/pricing/features/active`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then((d) => {
        if (!cancelled) {
          setFeatures(d.features ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeatures([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiOrigin]);

  return {
    features,
    loading,
    hasActiveFeature: (code: string) => features.some((f) => f.code === code),
  };
}
