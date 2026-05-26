"use client";

import { useStore } from "better-auth/react";
import { useEffect, useState } from "react";
import { appClient, authClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";

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
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const session = useStore(authClient.useSession);

  useEffect(() => {
    if (session.isPending) return;

    if (!session.data) {
      setApp(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    apiWithFeedback(appClient.api.applications.current.$get)()
      .then(async (res) => {
        const data = (await res.json()) as Application;
        setApp(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.isPending, session.data]);

  return { app, loading };
}
