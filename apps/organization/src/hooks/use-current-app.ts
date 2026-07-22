"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient, useSession, withApiFeedback } from "@/lib/api";

export function useCurrentApp() {
  const session = useSession();

  const query = useQuery({
    queryKey: ["applications", "current"],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.applications.current.$get,
        {
          showError: false,
        },
      )();
      return res.json();
    },
    staleTime: 3_000,
    enabled: !session.isPending && !!session.data,
  });

  return {
    app: query.data ?? null,
    loading: session.isPending || query.isLoading,
  };
}
