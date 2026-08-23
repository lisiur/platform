"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { appClient, withApiFeedback } from "@/lib/api";
import { useLedgerStore } from "@/stores/ledger-store";

export interface QianlaiLedger {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  currency: string;
  status: "active" | "archived";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  myRole: "owner" | "editor" | "viewer";
  membersCount: number;
  shared: boolean;
}

/**
 * Loads the caller's ledgers and resolves the active one: the persisted
 * choice when still valid, else the default, else the first. The first call
 * lazily provisions the default ledger server-side.
 */
export function useLedgers() {
  const activeLedgerId = useLedgerStore((s) => s.activeLedgerId);
  const setActiveLedger = useLedgerStore((s) => s.setActiveLedger);

  const { data, isLoading } = useQuery({
    queryKey: ["qianlai", "ledgers"],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers.$get,
      )();
      return (await res.json()) as { ledgers: QianlaiLedger[] };
    },
  });

  const ledgers = data?.ledgers ?? [];
  // Archived ledgers are skipped as an auto-selection fallback (they are
  // read-only); the persisted choice is still honored when it points at one.
  const activeLedger =
    ledgers.find((l) => l.id === activeLedgerId) ??
    ledgers.find((l) => l.isDefault && l.status === "active") ??
    ledgers.find((l) => l.status === "active") ??
    ledgers[0] ??
    null;

  useEffect(() => {
    if (activeLedger && activeLedger.id !== activeLedgerId) {
      setActiveLedger(activeLedger.id);
    }
  }, [activeLedger, activeLedgerId, setActiveLedger]);

  return { ledgers, activeLedger, isLoading };
}
