"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/stores/session-store";

export function useSession() {
  const { data, isPending, fetched, fetchSession, refetchSession } =
    useSessionStore();

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  return { data, isPending, fetched, refetch: refetchSession };
}
