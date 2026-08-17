"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Coins, Snowflake } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient, withApiFeedback } from "@/lib/api";
import { useSession } from "@/lib/api/use-session";
import { formatDateTime } from "@/utils/date";

const ledgerTypeKeys: Record<string, string> = {
  redeem: "typeRedeem",
  ai_usage: "typeAiUsage",
  ai_usage_reserve: "typeAiUsageReserve",
  ai_usage_refund: "typeAiUsageRefund",
};

interface CreditLedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

export function CreditUsageOverview() {
  const t = useTranslations("CreditUsage");
  const { data: session } = useSession();
  const user = session?.user;

  const { data: creditData } = useQuery({
    queryKey: ["redeem-codes", "me", "credit"],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api["redeem-codes"].me.credit.$get,
        { showError: false },
      )();
      return res.json();
    },
    enabled: !!user,
  });

  const {
    items: entries,
    total,
    page,
    pageSize,
    loading,
    setPage,
  } = usePaginatedQuery<CreditLedgerEntry>({
    queryKey: ["redeem-codes", "me", "credit", "ledger"],
    enabled: !!user,
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(
        appClient.api["redeem-codes"].me.credit.ledger.$get,
      )({ query: { limit, offset } });
      const data = await res.json();
      return { items: data.entries, total: data.total };
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Coins className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-sm">
              {t("balance")}
            </span>
            <span className="font-mono font-semibold text-2xl leading-tight">
              {creditData?.balance ?? "—"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Snowflake className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-sm">{t("frozen")}</span>
            <span className="font-mono font-semibold text-2xl leading-tight">
              {creditData?.frozen ?? "—"}
            </span>
          </div>
        </div>
      </div>
      <PaginatedTableFrame
        loading={loading}
        empty={entries.length === 0}
        emptyMessage={t("noEntries")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("createdAt")}</TableHead>
            <TableHead>{t("type")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("balanceBefore")}</TableHead>
            <TableHead>{t("balanceAfter")}</TableHead>
            <TableHead>{t("descriptionLabel")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
              <TableCell>
                {entry.type in ledgerTypeKeys
                  ? t(ledgerTypeKeys[entry.type])
                  : entry.type}
              </TableCell>
              <TableCell
                className={`font-mono ${
                  entry.amount >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
              </TableCell>
              <TableCell className="font-mono">{entry.balanceBefore}</TableCell>
              <TableCell className="font-mono">{entry.balanceAfter}</TableCell>
              <TableCell>{entry.description ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>
    </div>
  );
}
