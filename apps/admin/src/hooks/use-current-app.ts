"use client";

import { useEffect, useState } from "react";
import { appClient } from "@/lib/api";

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

  useEffect(() => {
    appClient.api.applications.current
      .$get()
      .then(async (res: Response) => {
        if (res.ok) {
          const data = (await res.json()) as Application;
          setApp(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { app, loading };
}
