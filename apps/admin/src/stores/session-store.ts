"use client";

import { create } from "zustand";
import { appClient } from "@/lib/api/app-client";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null;
  flags: string[];
};

type AuthSession = {
  id: string;
  userId: string;
  expiresAt: string;
};

type SessionData = {
  user: AuthUser;
  session: AuthSession;
} | null;

interface SessionState {
  data: SessionData;
  isPending: boolean;
  fetched: boolean;
  fetchSession: () => Promise<void>;
  refetchSession: () => Promise<void>;
}

let inflight: Promise<SessionData> | null = null;

async function fetchSessionOnce(): Promise<SessionData> {
  if (inflight) return inflight;

  inflight = appClient.api.auth["get-session"]
    .$get()
    .then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as SessionData;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  data: null,
  isPending: true,
  fetched: false,

  fetchSession: async () => {
    if (get().fetched) return;

    set({ isPending: true });
    try {
      const data = await fetchSessionOnce();
      set({ data, fetched: true });
    } catch {
      set({ fetched: true });
    } finally {
      set({ isPending: false });
    }
  },

  refetchSession: async () => {
    set({ fetched: false });
    await get().fetchSession();
  },
}));
