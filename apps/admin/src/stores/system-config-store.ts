"use client";

import { create } from "zustand";
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";

interface SystemConfigState {
  configs: Record<string, string>;
  loading: boolean;
  fetchedGroups: Set<string>;
  fetchByGroup: (group: string) => Promise<void>;
  updateConfig: (group: string, key: string, value: string) => void;
}

export const useSystemConfigStore = create<SystemConfigState>((set, get) => ({
  configs: {},
  loading: false,
  fetchedGroups: new Set(),

  fetchByGroup: async (group: string) => {
    if (get().fetchedGroups.has(group)) return;

    set({ loading: true });
    try {
      const res = await apiWithFeedback(
        appClient.api["system-config"][":group"].$get,
      )({
        param: { group },
      });
      const items = await res.json();
      const configs: Record<string, string> = {};
      for (const item of items) {
        configs[item.key] = item.value;
      }
      set((state) => ({
        configs: { ...state.configs, ...configs },
        fetchedGroups: new Set([...state.fetchedGroups, group]),
      }));
    } catch {
      // Keep existing values on error
    } finally {
      set({ loading: false });
    }
  },

  updateConfig: (_group: string, key: string, value: string) => {
    set((state) => ({
      configs: { ...state.configs, [key]: value },
    }));
  },
}));
