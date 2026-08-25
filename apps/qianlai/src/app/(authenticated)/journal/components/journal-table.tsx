"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import { roleAtLeast } from "@repo/shared";
import {
  Badge,
  Button,
  ButtonGroup,
  type DateRange,
  DateRangePicker,
  DropdownMenuItem,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  Spinner,
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
import { Plus, Search, Trash2, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useAccountName } from "@/hooks/use-account-name";
import { useConfirm } from "@/hooks/use-confirm";
import { useLedgers } from "@/hooks/use-ledgers";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatAmount } from "@/utils/amount";
import { formatDate } from "@/utils/date";
import { QuickEntryDialog } from "./quick-entry-dialog";

interface JournalLineDto {
  id: string;
  accountId: string;
  account: {
    id: string;
    name: string | null;
    code: string | null;
    type: string;
    sortOrder: number;
  };
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
  participants: Array<{
    id: string;
    ledgerMemberId: string;
    user: { id: string; name: string } | null;
  }>;
}

interface MemberRow {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string | null } | null;
}

export function JournalTable() {
  const t = useTranslations("Journal");
  const accountName = useAccountName();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();
  const [quickOpen, setQuickOpen] = useState(false);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [appliedDateRange, setAppliedDateRange] = useState<
    DateRange | undefined
  >();
  const [participantMemberId, setParticipantMemberId] = useState<string>("");
  const [appliedMemberId, setAppliedMemberId] = useState<string>("");

  const { data: membersData } = useQuery({
    queryKey: ["qianlai", "members", activeLedger?.id],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members.$get,
      )({ param: { ledgerId: activeLedger?.id } });
      return res.json() as Promise<{ members: MemberRow[] }>;
    },
    enabled: !!activeLedger,
  });

  const members = membersData?.members ?? [];

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
    queryKey: [
      "qianlai",
      "entries",
      activeLedger?.id,
      appliedQ,
      appliedDateRange,
      appliedMemberId,
    ],
    enabled: !!activeLedger,
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].entries.$get,
      )({
        param: { ledgerId: activeLedger?.id },
        query: {
          limit,
          offset,
          q: appliedQ || undefined,
          from: appliedDateRange?.from,
          to: appliedDateRange?.to,
          participantMemberId: appliedMemberId || undefined,
        },
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

  function applyFilters() {
    setAppliedQ(q.trim());
    setAppliedDateRange(dateRange);
    setAppliedMemberId(participantMemberId);
    setPage(1);
  }

  function clearFilters() {
    setQ("");
    setAppliedQ("");
    setDateRange(undefined);
    setAppliedDateRange(undefined);
    setParticipantMemberId("");
    setAppliedMemberId("");
    setPage(1);
  }

  const hasActiveFilters =
    appliedQ ||
    appliedDateRange?.from ||
    appliedDateRange?.to ||
    appliedMemberId;

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
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "member-turnover", activeLedger?.id],
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
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        <form
          className="relative w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
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
        <DateRangePicker
          startDate={dateRange?.from}
          endDate={dateRange?.to}
          onChange={(range) => setDateRange(range)}
          className="w-64"
        />
        <Select
          value={participantMemberId || "all"}
          onValueChange={(v) =>
            setParticipantMemberId(!v || v === "all" ? "" : v)
          }
          items={[
            { value: "all", label: t("allMembers") },
            ...members.map((m) => ({
              value: m.id,
              label: m.user?.name ?? m.userId,
            })),
          ]}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("filterByMember")} />
          </SelectTrigger>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1" />
        {canPost && (
          <Button onClick={() => setQuickOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("quickCreate")}
          </Button>
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
                          {accountName(line.account)}
                          <span className="ml-1 font-mono tabular-nums">
                            {line.debit > 0
                              ? `+${formatAmount(line.debit)}`
                              : `-${formatAmount(line.credit)}`}
                          </span>
                        </span>
                      ))}
                    </div>
                    {entry.participants?.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Users className="text-muted-foreground h-3 w-3" />
                        {entry.participants.map((participant) => (
                          <Badge
                            key={participant.id}
                            variant="secondary"
                            className="text-xs"
                          >
                            {participant.user?.name ??
                              participant.ledgerMemberId}
                          </Badge>
                        ))}
                      </div>
                    )}
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
      </PaginatedTableFrame>
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
