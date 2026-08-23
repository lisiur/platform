"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import { roleAtLeast } from "@repo/shared";
import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenuItem,
  Input,
  Spinner,
  Table,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { useLedgers } from "@/hooks/use-ledgers";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatAmount } from "@/utils/amount";
import { formatDate } from "@/utils/date";
import { EntryDialog } from "./entry-dialog";
import { QuickEntryDialog } from "./quick-entry-dialog";

interface JournalLineDto {
  id: string;
  accountId: string;
  account: { id: string; code: string; name: string; type: string };
  debit: number;
  credit: number;
  memo: string | null;
}

interface EntryRow {
  id: string;
  ledgerId: string;
  entryNo: number;
  date: string;
  memo: string | null;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  lines: JournalLineDto[];
}

export function JournalTable() {
  const t = useTranslations("Journal");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");

  const canPost =
    !!activeLedger &&
    activeLedger.status === "active" &&
    roleAtLeast(activeLedger.myRole, "editor");

  const {
    items: entries,
    total,
    page,
    pageSize,
    loading,
    setPage,
  } = usePaginatedQuery<EntryRow>({
    queryKey: ["qianlai", "entries", activeLedger?.id, appliedQ],
    enabled: !!activeLedger,
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].entries.$get,
      )({
        param: { ledgerId: activeLedger?.id },
        query: { limit, offset, q: appliedQ || undefined },
      });
      const data = await res.json();
      return { items: data.entries, total: data.total };
    },
  });

  useQuery({
    queryKey: ["qianlai", "accounts", activeLedger?.id],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$get,
      )({ param: { ledgerId: activeLedger?.id } });
      return res.json();
    },
    enabled: !!activeLedger,
  });

  async function handleDelete(entry: EntryRow) {
    const confirmed = await confirm({
      title: t("delete"),
      description: t("confirmDelete", { entryNo: entry.entryNo }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].entries[":id"].$delete,
      )({ param: { ledgerId: activeLedger?.id, id: entry.id } });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "entries", activeLedger?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "dashboard", activeLedger?.id],
      });
      toast.success(t("deleteSuccess"));
    } catch {
      // handled by withApiFeedback
    }
  }

  if (ledgersLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <form
          className="relative w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQ(q.trim());
            setPage(0);
          }}
        >
          <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder={t("searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <div className="flex-1" />
        {canPost && (
          <>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              {t("advancedCreate")}
            </Button>
            <Button onClick={() => setQuickOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("quickCreate")}
            </Button>
          </>
        )}
      </div>
      <PaginatedTableFrame
        loading={loading}
        empty={entries.length === 0}
        emptyMessage={t("empty")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <Table containerClassName="overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-16">{t("entryNo")}</TableHead>
              <TableHead className="w-28">{t("date")}</TableHead>
              <TableHead>{t("lines")}</TableHead>
              <TableHead className="w-28 text-right">{t("amount")}</TableHead>
              <TableHead className="w-24">{t("createdBy")}</TableHead>
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const amount = entry.lines.reduce(
                (acc, line) => acc + line.debit,
                0,
              );
              return (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono tabular-nums">
                    #{entry.entryNo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(entry.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate">{entry.memo ?? "—"}</span>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {entry.lines.map((line) => (
                          <span
                            key={line.id}
                            className="text-muted-foreground text-xs"
                          >
                            {line.account.name}
                            <span className="ml-1 font-mono tabular-nums">
                              {line.debit > 0
                                ? `+${formatAmount(line.debit)}`
                                : `-${formatAmount(line.credit)}`}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatAmount(amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {entry.createdBy?.name ?? "—"}
                  </TableCell>
                  <TableActionCell
                    menuLabel={t("actions")}
                    menu={
                      canPost ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(entry)}
                        >
                          <Trash2 />
                          {t("delete")}
                        </DropdownMenuItem>
                      ) : undefined
                    }
                  >
                    {canPost && (
                      <ButtonGroup className="ml-auto">
                        <TooltipButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("delete")}
                          tooltip={t("delete")}
                          onClick={() => handleDelete(entry)}
                        >
                          <Trash2 />
                        </TooltipButton>
                      </ButtonGroup>
                    )}
                  </TableActionCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </PaginatedTableFrame>
      <EntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ledgerId={activeLedger?.id ?? ""}
      />
      <QuickEntryDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        ledgerId={activeLedger?.id ?? ""}
      />
      {!canPost && activeLedger && (
        <p className="text-muted-foreground mt-3 text-center text-sm">
          <Badge variant="outline" className="mr-1">
            {activeLedger.myRole}
          </Badge>
          {t("readOnly")}
        </p>
      )}
    </>
  );
}
