"use client";

import {
  Badge,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useLedgers } from "@/hooks/use-ledgers";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatAmount } from "@/utils/amount";

interface TrialBalanceRow {
  id: string;
  name: string;
  type: string;
  sortOrder: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

interface TrialBalanceDto {
  accounts: TrialBalanceRow[];
  totals: { debit: number; credit: number };
}

interface StatementRow {
  id: string;
  name: string;
  type: string;
  sortOrder: number;
  balance: number;
}

interface IncomeStatementDto {
  income: StatementRow[];
  expense: StatementRow[];
  totalIncome: number;
  totalExpense: number;
  net: number;
}

// Entry dates are stored at UTC midnight, so window boundaries must be UTC
// instants built from the picked YYYY-MM-DD — local-timezone Dates skew the
// window by up to a day for non-UTC users.
function startOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function endOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

export function ReportsView() {
  const t = useTranslations("Reports");
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: trial, isLoading: trialLoading } = useQuery({
    queryKey: ["qianlai", "trial-balance", activeLedger?.id],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].reports["trial-balance"]
          .$get,
      )({ param: { ledgerId: activeLedger?.id } });
      return (await res.json()) as TrialBalanceDto;
    },
    enabled: !!activeLedger,
  });

  const { data: statement, isLoading: statementLoading } = useQuery({
    queryKey: ["qianlai", "income-statement", activeLedger?.id, from, to],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].reports[
          "income-statement"
        ].$get,
      )({
        param: { ledgerId: activeLedger?.id },
        query: {
          from: from ? startOfUtcDay(from).toISOString() : undefined,
          to: to ? endOfUtcDay(to).toISOString() : undefined,
        },
      });
      return (await res.json()) as IncomeStatementDto;
    },
    enabled: !!activeLedger,
  });

  if (ledgersLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Tabs defaultValue="trial-balance" className="gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="trial-balance">
            {t("tabs.trialBalance")}
          </TabsTrigger>
          <TabsTrigger value="income-statement">
            {t("tabs.incomeStatement")}
          </TabsTrigger>
        </TabsList>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label={t("from")}
            className="w-40"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            type="date"
            aria-label={t("to")}
            className="w-40"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <TabsContent value="trial-balance">
        {trialLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Spinner />
          </div>
        ) : !trial || trial.accounts.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <Table containerClassName="overflow-auto rounded-md border">
            <TableHeader sticky>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead className="text-right">{t("totalDebit")}</TableHead>
                <TableHead className="text-right">{t("totalCredit")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trial.accounts.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`types.${row.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatAmount(row.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatAmount(row.totalCredit)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatAmount(row.balance)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>{t("totals")}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatAmount(trial.totals.debit)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatAmount(trial.totals.credit)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </TabsContent>

      <TabsContent value="income-statement">
        {statementLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Spinner />
          </div>
        ) : !statement ||
          (statement.income.length === 0 && statement.expense.length === 0) ? (
          <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {(
              [
                ["income", statement.income, statement.totalIncome],
                ["expense", statement.expense, statement.totalExpense],
              ] as const
            ).map(([key, rows, total]) => (
              <Table
                key={key}
                containerClassName="overflow-auto rounded-md border"
              >
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>{t(key)}</TableHead>
                    <TableHead className="text-right">{t("balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatAmount(row.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>
                      {key === "income" ? t("totalIncome") : t("totalExpense")}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatAmount(total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ))}
            <div className="text-right font-semibold lg:col-span-2">
              {t("net")}:{" "}
              <span
                className={`font-mono tabular-nums ${
                  statement.net >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatAmount(statement.net)}
              </span>
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
