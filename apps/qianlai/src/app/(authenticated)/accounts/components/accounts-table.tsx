"use client";

import { roleAtLeast } from "@repo/shared";
import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenuItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { useLedgers } from "@/hooks/use-ledgers";
import { appClient, withApiFeedback } from "@/lib/api";
import { AccountDialog } from "./account-dialog";

export interface AccountRow {
  id: string;
  ledgerId: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  sortOrder: number;
  parentId: string | null;
  status: string;
  icon: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

const ACCOUNT_TYPE_LIST = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

const TYPE_BADGE: Record<string, string> = {
  asset: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  liability: "bg-red-500/10 text-red-600 dark:text-red-400",
  equity: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  income: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expense: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

export function AccountsTable() {
  const t = useTranslations("Accounts");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();
  const [createOpen, setCreateOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountRow | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const canManage =
    !!activeLedger &&
    activeLedger.status === "active" &&
    roleAtLeast(activeLedger.myRole, "editor");

  const { data, isLoading } = useQuery({
    queryKey: ["qianlai", "accounts", activeLedger?.id],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$get,
      )({ param: { ledgerId: activeLedger?.id } });
      return (await res.json()) as { accounts: AccountRow[] };
    },
    enabled: !!activeLedger,
  });

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: ["qianlai", "accounts", activeLedger?.id],
    });
  }

  async function handleArchiveToggle(account: AccountRow) {
    const archiving = account.status === "active";
    try {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].$patch,
      )({
        param: { ledgerId: activeLedger?.id, id: account.id },
        json: { status: archiving ? "archived" : "active" },
      });
      invalidate();
      toast.success(archiving ? t("archiveSuccess") : t("unarchiveSuccess"));
    } catch {
      // handled by withApiFeedback
    }
  }

  async function handleDelete(account: AccountRow) {
    const confirmed = await confirm({
      title: t("delete"),
      description: t("confirmDelete", { name: account.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].$delete,
      )({ param: { ledgerId: activeLedger?.id, id: account.id } });
      invalidate();
      toast.success(t("deleteSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("journal lines")) {
        toast.error(t("hasLinesError"));
      } else if (message.includes("children")) {
        toast.error(t("hasChildrenError"));
      }
    }
  }

  if (ledgersLoading || (isLoading && activeLedger)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const accounts = (data?.accounts ?? []).filter(
    (a) => typeFilter === "all" || a.type === typeFilter,
  );

  return (
    <>
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <Select
          value={typeFilter}
          onValueChange={(v) => v !== null && setTypeFilter(v)}
          items={[
            { value: "all", label: `${t("type")}: All` },
            ...ACCOUNT_TYPE_LIST.map((type) => ({
              value: type,
              label: t(`types.${type}`),
            })),
          ]}
          aria-label={t("type")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("type")}: All</SelectItem>
            {ACCOUNT_TYPE_LIST.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("create")}
          </Button>
        )}
      </div>
      {accounts.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <Table containerClassName="overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">
                  {account.icon && (
                    <span aria-hidden className="mr-1.5">
                      {account.icon}
                    </span>
                  )}
                  {account.name}
                </TableCell>
                <TableCell>
                  <Badge className={TYPE_BADGE[account.type]} variant="outline">
                    {t(`types.${account.type}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {account.status === "active"
                    ? t("statuses.active")
                    : t("statuses.archived")}
                </TableCell>
                <TableActionCell
                  menuLabel={t("actions")}
                  menu={
                    canManage ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => setEditAccount(account)}
                        >
                          <Pencil />
                          {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleArchiveToggle(account)}
                        >
                          {account.status === "active" ? (
                            <>
                              <Archive />
                              {t("archive")}
                            </>
                          ) : (
                            <>
                              <ArchiveRestore />
                              {t("unarchive")}
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(account)}
                        >
                          <Trash2 />
                          {t("delete")}
                        </DropdownMenuItem>
                      </>
                    ) : undefined
                  }
                >
                  {canManage && (
                    <ButtonGroup className="ml-auto">
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("edit")}
                        tooltip={t("edit")}
                        onClick={() => setEditAccount(account)}
                      >
                        <Pencil />
                      </TooltipButton>
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        tooltip={t("delete")}
                        onClick={() => handleDelete(account)}
                      >
                        <Trash2 />
                      </TooltipButton>
                    </ButtonGroup>
                  )}
                </TableActionCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ledgerId={activeLedger?.id ?? ""}
      />
      {editAccount && (
        <AccountDialog
          open={!!editAccount}
          onOpenChange={(open) => !open && setEditAccount(null)}
          ledgerId={activeLedger?.id ?? ""}
          account={editAccount}
        />
      )}
    </>
  );
}
