"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface Application {
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
}

export function useCurrentApp() {
  const query = useQuery({
    queryKey: ["applications", "current"],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.applications.current.$get,
      )();
      return (await res.json()) as Application;
    },
  });

  return {
    app: query.data ?? null,
    loading: query.isLoading,
  };
}
