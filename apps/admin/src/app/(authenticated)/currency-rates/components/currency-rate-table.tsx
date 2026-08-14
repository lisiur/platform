"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import {
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { withApiFeedback } from "@/lib/api/utils";

interface CurrencyRateRow {
  id: string;
  currency: string;
  rate: number;
  status: string;
  updatedAt: string;
}

async function fetchLastSync() {
  const res = await withApiFeedback(
    appClient.api["system-config"][":group"].$get,
  )({ param: { group: "currency" } });
  const data = (await res.json()) as Array<{ key: string; value: string }>;
  return data.find((item) => item.key === "lastSync")?.value || null;
}

export function CurrencyRateTable() {
  const t = useTranslations("CurrencyRates");
  const canUpdate = useHasPermission("system/billing-config:update");
  const canDelete = useHasPermission("system/billing-config:delete");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    fetchLastSync()
      .then(setLastSync)
      .catch(() => setLastSync(null));
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { items, total, page, pageSize, loading, setPage, refresh } =
    usePaginatedQuery<CurrencyRateRow>({
      queryKey: ["currency-rates", debouncedSearch],
      pageSize: 1000,
      queryFn: async ({ limit, offset }) => {
        const res = await withApiFeedback(
          appClient.api.billing["currency-rates"].$get,
        )({ query: { limit, offset, search: debouncedSearch || undefined } });
        const data = await res.json();
        return { items: data.rates, total: data.total };
      },
    });

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }

  async function remove(item: CurrencyRateRow) {
    await withApiFeedback(
      appClient.api.billing["currency-rates"][":id"].$delete,
    )({ param: { id: item.id } });
    refresh();
    toast.success(t("deleted"));
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await withApiFeedback(
        appClient.api.billing["currency-rates"].sync.$post,
      )({});
      const data = await res.json();
      refresh();
      setLastSync(data.syncedAt);
      toast.success(t("synced", { count: data.synced }));
    } catch {
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Card className="mb-6 shrink-0">
        <CardHeader>
          <CardTitle>{t("syncStatus")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {t("lastSync")}:{" "}
            {lastSync ? new Date(lastSync).toLocaleString() : t("never")}
          </div>
        </CardContent>
      </Card>

      <PaginatedTableFrame
        loading={loading}
        empty={items.length === 0}
        emptyMessage={t("empty")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        className="min-h-0 flex-1"
        toolbar={
          <div className="flex w-full items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(event) => handleSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="ml-auto flex gap-2">
              {canUpdate && (
                <Button variant="outline" onClick={sync} disabled={syncing}>
                  <RefreshCw />
                  {syncing ? t("syncing") : t("sync")}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("currency")}</TableHead>
            <TableHead>{t("rate")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono">{item.currency}</TableCell>
              <TableCell className="font-mono">{item.rate}</TableCell>
              <TableActionCell menuLabel={t("actions")}>
                <ButtonGroup className="ml-auto">
                  {canDelete && (
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("delete")}
                      tooltip={t("delete")}
                      onClick={() => remove(item)}
                    >
                      <Trash2 />
                    </TooltipButton>
                  )}
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>
    </div>
  );
}
