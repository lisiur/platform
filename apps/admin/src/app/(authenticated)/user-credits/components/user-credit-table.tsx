"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import {
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenuItem,
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
import { FileText, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { withApiFeedback } from "@/lib/api/utils";

interface UserCreditRow {
  id: string;
  userId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
  };
}

interface UserCreditLedgerRow {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

export function UserCreditTable() {
  const t = useTranslations("UserCredits");
  const canView = useHasPermission("system/user-credit:list");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [ledgerItem, setLedgerItem] = useState<UserCreditRow | null>(null);

  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);

  const {
    items: credits,
    total,
    page,
    pageSize,
    loading,
    setPage,
  } = usePaginatedQuery<UserCreditRow>({
    queryKey: ["user-credits", { search: ds || undefined }],
    enabled: canView,
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(
        appClient.api["redeem-codes"].credits.$get,
      )({ query: { limit, offset } });
      const data = await res.json();
      return { items: data.credits, total: data.total };
    },
  });

  const {
    items: ledgerEntries,
    total: ledgerTotal,
    page: ledgerPage,
    pageSize: ledgerPageSize,
    loading: ledgerLoading,
    setPage: setLedgerPage,
  } = usePaginatedQuery<UserCreditLedgerRow>({
    queryKey: ["user-credit-ledger", ledgerItem?.userId],
    enabled: !!ledgerItem,
    queryFn: async ({ limit, offset }) => {
      if (!ledgerItem) return { items: [], total: 0 };
      const res = await withApiFeedback(
        appClient.api["redeem-codes"].credits[":userId"].ledger.$get,
      )({ param: { userId: ledgerItem.userId }, query: { limit, offset } });
      const data = await res.json();
      return { items: data.entries, total: data.total };
    },
  });

  function hs(v: string) {
    setSearch(v);
    if (dr.current) clearTimeout(dr.current);
    dr.current = setTimeout(() => {
      setDs(v);
      setPage(1);
    }, 300);
  }

  function openLedger(c: UserCreditRow) {
    setLedgerPage(1);
    setLedgerItem(c);
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={credits.length === 0}
        emptyMessage={t("noCredits")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex items-center gap-3 w-full">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => hs(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("user")}</TableHead>
            <TableHead>{t("balance")}</TableHead>
            <TableHead>{t("updatedAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {credits.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{c.user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.user.email ?? "-"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono">{c.balance}</TableCell>
              <TableCell>
                {new Date(c.updatedAt).toLocaleDateString()}
              </TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <DropdownMenuItem onClick={() => openLedger(c)}>
                    <FileText />
                    {t("ledger")}
                  </DropdownMenuItem>
                }
              >
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("ledger")}
                    tooltip={t("ledger")}
                    onClick={() => openLedger(c)}
                  >
                    <FileText />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog
        open={!!ledgerItem}
        onOpenChange={(open) => {
          if (!open) setLedgerItem(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("ledger")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <PaginatedTableFrame
              loading={ledgerLoading}
              empty={ledgerEntries.length === 0}
              emptyMessage={t("noLedgerEntries")}
              page={ledgerPage}
              total={ledgerTotal}
              pageSize={ledgerPageSize}
              onPageChange={setLedgerPage}
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
                {ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{entry.type}</TableCell>
                    <TableCell className="font-mono">{entry.amount}</TableCell>
                    <TableCell className="font-mono">
                      {entry.balanceBefore}
                    </TableCell>
                    <TableCell className="font-mono">
                      {entry.balanceAfter}
                    </TableCell>
                    <TableCell>{entry.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </PaginatedTableFrame>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
