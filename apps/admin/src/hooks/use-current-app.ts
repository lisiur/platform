"use client";

import { useEffect, useState } from "react";
import { appClient, useSession } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

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
  const session = useSession();

  useEffect(() => {
    if (session.isPending) return;

    if (!session.data) {
      setApp(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    withApiFeedback(appClient.api.applications.current.$get)()
      .then(async (res) => {
        const data = (await res.json()) as Application;
        setApp(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.isPending, session.data]);

  return { app, loading };
}
