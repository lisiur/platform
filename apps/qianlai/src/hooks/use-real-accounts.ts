"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient, withApiFeedback } from "@/lib/api";

export interface RealAccountPocketDto {
  id: string;
  ledgerId: string;
  ledgerName: string;
  ledgerStatus: "active" | "archived";
  name: string | null;
  code: string | null;
  type: "asset" | "liability";
  status: "active" | "archived";
  icon: string | null;
  /** Signed balance of this pocket within its own ledger. */
  balance: number;
}

export interface RealAccountDto {
  id: string;
  name: string;
  type: "asset" | "liability";
  status: "active" | "archived";
  icon: string | null;
  meta: Record<string, unknown> | null;
  /** Cross-ledger sum over membership-visible pockets. */
  balance: number;
  pockets: RealAccountPocketDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RealAccountsDto {
  realAccounts: RealAccountDto[];
  totals: {
    assets: number;
    liabilities: number;
    netWorth: number;
  };
}

export const realAccountsQueryKey = ["qianlai", "real-accounts"] as const;

/**
 * The caller's private cross-ledger net-worth view. Owner-scoped on the
 * server; pockets only cover ledgers the caller is currently a member of.
 */
export function useRealAccounts() {
  return useQuery({
    queryKey: realAccountsQueryKey,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping["real-accounts"].$get,
      )();
      return (await res.json()) as RealAccountsDto;
    },
  });
}
