"use client";

import { Badge, Card, CardContent, Spinner } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Scale, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLedgers } from "@/hooks/use-ledgers";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatAmount } from "@/utils/amount";
import { formatDateTime } from "@/utils/date";

interface JournalLineDto {
  id: string;
  accountId: string;
  account: { id: string; code: string; name: string; type: string };
  debit: number;
  credit: number;
  memo: string | null;
}

interface RecentEntryDto {
  id: string;
  entryNo: number;
  date: string;
  memo: string | null;
  createdBy: { id: string; name: string } | null;
  lines: JournalLineDto[];
}

interface DashboardDto {
  assets: number;
  liabilities: number;
  netWorth: number;
  month: {
    year: number;
    month: number;
    totalIncome: number;
    totalExpense: number;
    net: number;
  };
  recentEntries: RecentEntryDto[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: number | undefined;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-muted-foreground text-xs">{label}</p>
          <p className={`font-bold text-2xl tabular-nums ${toneClass}`}>
            {value === undefined ? "—" : formatAmount(value)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const t = useTranslations("Dashboard");
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();

  const { data, isLoading } = useQuery({
    queryKey: ["qianlai", "dashboard", activeLedger?.id],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].reports.dashboard.$get,
      )({ param: { ledgerId: activeLedger?.id } });
      return (await res.json()) as DashboardDto;
    },
    enabled: !!activeLedger,
  });

  if (ledgersLoading || (isLoading && activeLedger)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!activeLedger) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        {t("selectLedger")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Wallet}
          label={t("netWorth")}
          value={data?.netWorth}
          tone={data && data.netWorth < 0 ? "negative" : "default"}
        />
        <StatCard icon={Scale} label={t("assets")} value={data?.assets} />
        <StatCard
          icon={Scale}
          label={t("liabilities")}
          value={data?.liabilities}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={ArrowUpRight}
          label={t("monthIncome")}
          value={data?.month.totalIncome}
          tone="positive"
        />
        <StatCard
          icon={ArrowDownRight}
          label={t("monthExpense")}
          value={data?.month.totalExpense}
          tone="negative"
        />
        <StatCard label={t("monthNet")} icon={Scale} value={data?.month.net} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{t("recentEntries")}</h3>
          <Link
            href="/journal"
            className="text-primary text-sm hover:underline"
          >
            {t("viewAll")}
          </Link>
        </div>
        <div className="rounded-lg border">
          {!data || data.recentEntries.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              {t("noRecentEntries")}
            </p>
          ) : (
            <ul className="divide-y">
              {data.recentEntries.map((entry) => {
                const amount = entry.lines.reduce(
                  (acc, line) => acc + line.debit,
                  0,
                );
                return (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <Badge variant="outline" className="font-mono tabular-nums">
                      #{entry.entryNo}
                    </Badge>
                    <span className="text-muted-foreground w-28 shrink-0">
                      {formatDateTime(entry.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {entry.memo ??
                        entry.lines.map((l) => l.account.name).join(" / ")}
                    </span>
                    {entry.createdBy && (
                      <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                        {entry.createdBy.name}
                      </span>
                    )}
                    <span className="w-24 shrink-0 text-right font-mono tabular-nums">
                      {formatAmount(amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
