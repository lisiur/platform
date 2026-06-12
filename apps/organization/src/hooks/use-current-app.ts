"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient, useSession } from "@/lib/api";

interface Application {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useCurrentApp() {
  const session = useSession();

  const query = useQuery({
    queryKey: ["applications", "current"],
    queryFn: async () => {
      const res = await appClient.api.applications.current.$get();
      if (!res.ok) throw new Error("Failed to load current application");
      return (await res.json()) as Application;
    },
    enabled: !session.isPending && !!session.data,
  });

  return {
    app: query.data ?? null,
    loading: session.isPending || query.isLoading,
  };
}
