"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LedgerStore {
  activeLedgerId: string | null;
  setActiveLedger: (id: string | null) => void;
}

export const useLedgerStore = create<LedgerStore>()(
  persist(
    (set) => ({
      activeLedgerId: null,
      setActiveLedger: (id) => set({ activeLedgerId: id }),
    }),
    { name: "qianlai-active-ledger" },
  ),
);
