"use client";

import type { CurrentApplication } from "@repo/frontend";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

export function useCurrentApp() {
  const query = useQuery({
    queryKey: ["applications", "current"],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.applications.current.$get,
      )();
      return (await res.json()) as CurrentApplication;
    },
    staleTime: 3_000,
  });

  return {
    app: query.data ?? null,
    loading: query.isLoading,
  };
}
