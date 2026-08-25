"use client";

import { roleAtLeast } from "@repo/shared";
import {
  Badge,
  Button,
  type ReorderChange,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useIsMobile,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountName } from "@/hooks/use-account-name";
import { useConfirm } from "@/hooks/use-confirm";
import { useLedgers } from "@/hooks/use-ledgers";
import { appClient, withApiFeedback } from "@/lib/api";
import { AccountDialog } from "./account-dialog";
import {
  AccountForm,
  type AccountFormInput,
  type AccountFormRef,
  accountToFormValues,
  buildMeta,
} from "./account-form";
import { AccountsTree } from "./accounts-tree";
import { BalanceDialog } from "./balance-dialog";

export interface AccountRow {
  id: string;
  ledgerId: string;
  /** Custom display-name override; null renders the code's localized label. */
  name: string | null;
  /** i18n key for seeded accounts; null for user-created accounts. */
  code: string | null;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  sortOrder: number;
  parentId: string | null;
  status: string;
  icon: string | null;
  flags: string[];
  meta: Record<string, unknown> | null;
  createdAt: string;
}

/** Tabs shown to users; equity is system-managed and not listed in the UI. */
const ACCOUNT_TYPE_LIST = ["asset", "liability", "income", "expense"] as const;

const TYPE_BADGE: Record<AccountRow["type"], string> = {
  asset: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  liability: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  equity: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  income: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expense: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

export function AccountsTable() {
  const t = useTranslations("Accounts");
  const accountName = useAccountName();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState<AccountRow | null>(null);
  const [balanceAccount, setBalanceAccount] = useState<AccountRow | null>(null);
  const [activeTab, setActiveTab] = useState<string>("asset");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editFormRef = useRef<AccountFormRef>(null);

  const canManage =
    !!activeLedger &&
    activeLedger.status === "active" &&
    roleAtLeast(activeLedger.myRole, "editor");

  const accountsQueryKey = ["qianlai", "accounts", activeLedger?.id];

  const { data, isLoading } = useQuery({
    queryKey: accountsQueryKey,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$get,
      )({ param: { ledgerId: activeLedger?.id } });
      return (await res.json()) as { accounts: AccountRow[] };
    },
    enabled: !!activeLedger,
  });

  // Synchronous reorder mirror (see handleReorder): holds the reordered list
  // plus the query snapshot it was based on. Stale as soon as fresh query
  // data renders (identity mismatch), so the cache stays the source of truth.
  const [local, setLocal] = useState<{
    source: { accounts: AccountRow[] } | undefined;
    accounts: AccountRow[];
  } | null>(null);
  const accounts =
    local && local.source === data ? local.accounts : (data?.accounts ?? []);

  // Selection is derived from the current list so it survives refetches and
  // drops automatically when the account is deleted or the ledger changes.
  const selectedAccount = selectedId
    ? (accounts.find((a) => a.id === selectedId) ?? null)
    : null;

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: accountsQueryKey,
    });
  }

  function openBalance(account: AccountRow) {
    setBalanceAccount(account);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Built-in")) {
        toast.error(t("builtinArchiveError"));
      }
    }
  }

  async function handleDelete(account: AccountRow) {
    const confirmed = await confirm({
      title: t("delete"),
      description: t("confirmDelete", { name: accountName(account) }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].$delete,
      )({
        param: { ledgerId: activeLedger?.id, id: account.id },
      });
      invalidate();
      toast.success(t("deleteSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("journal lines")) {
        toast.error(t("hasLinesError"));
      } else if (message.includes("children")) {
        toast.error(t("hasChildrenError"));
      } else if (message.includes("Built-in")) {
        toast.error(t("builtinDeleteError"));
      }
    }
  }

  /**
   * Drag-to-reorder: apply the move to a synchronous local mirror so the
   * reorder renders in the same paint as dnd-kit's drop (react-query cache
   * notifications arrive a microtask too late, which flashes the item back
   * to its origin — the admin menu tree avoids this with local state).
   * The mirror is dropped whenever fresh query data renders; on failure we
   * roll back to the cached order and refetch.
   */
  async function handleReorder(changes: ReorderChange[]) {
    if (!activeLedger) return;
    const base =
      local && local.source === data ? local.accounts : (data?.accounts ?? []);
    const reordered = base.map((account) => {
      const change = changes.find((c) => c.id === account.id);
      return change ? { ...account, sortOrder: change.sortOrder } : account;
    });
    setLocal({ source: data, accounts: reordered });
    try {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.reorder.$post,
      )({
        param: { ledgerId: activeLedger.id },
        json: { items: changes },
      });
      const result = (await res.json()) as { accounts: AccountRow[] };
      queryClient.setQueryData(accountsQueryKey, result);
      setLocal({ source: data, accounts: result.accounts });
    } catch {
      setLocal(null);
      invalidate();
    }
  }

  async function handleEditSave() {
    if (!editFormRef.current || !selectedAccount || !activeLedger) return;
    let data: AccountFormInput;
    try {
      data = await editFormRef.current.validate();
    } catch {
      return;
    }
    setSaving(true);
    try {
      // Seeded accounts: an empty name reverts to the localized label
      // (null); typing a custom name stores it as an override. The code
      // is never cleared.
      const name = selectedAccount.code ? data.name.trim() || null : data.name;
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].$patch,
      )({
        param: { ledgerId: activeLedger.id, id: selectedAccount.id },
        json: {
          name,
          icon: data.icon.trim() || null,
          meta: buildMeta(data.metaEntries),
        },
      });
      invalidate();
      toast.success(t("updateSuccess"));
      if (isMobile) {
        setSelectedId(null);
      }
    } catch {
      // handled by withApiFeedback
    } finally {
      setSaving(false);
    }
  }

  if (ledgersLoading || (isLoading && activeLedger)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const byType = (type: AccountRow["type"]) =>
    accounts.filter((a) => a.type === type);

  const treeProps = {
    canManage,
    selectedId,
    onSelect: (account: AccountRow) => setSelectedId(account.id),
    onSetBalance: openBalance,
    onArchiveToggle: handleArchiveToggle,
    onDelete: handleDelete,
    onCreateChild: (parent: AccountRow) => setCreateParent(parent),
    onReorder: handleReorder,
  };

  const treePane = (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(String(value))}
      className="min-h-0 flex-1 gap-4"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <TabsList>
          {ACCOUNT_TYPE_LIST.map((type) => (
            <TabsTrigger key={type} value={type}>
              {t(`types.${type}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1" />
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("create")}
          </Button>
        )}
      </div>
      <TabsContent value="asset" className="flex min-h-0 flex-col">
        <AccountsTree accounts={byType("asset")} {...treeProps} />
      </TabsContent>
      <TabsContent value="liability" className="flex min-h-0 flex-col">
        <AccountsTree accounts={byType("liability")} {...treeProps} />
      </TabsContent>
      <TabsContent value="income" className="flex min-h-0 flex-col">
        <AccountsTree accounts={byType("income")} {...treeProps} />
      </TabsContent>
      <TabsContent value="expense" className="flex min-h-0 flex-col">
        <AccountsTree accounts={byType("expense")} {...treeProps} />
      </TabsContent>
    </Tabs>
  );

  const editContent = selectedAccount ? (
    <AccountForm
      key={selectedAccount.id}
      ref={editFormRef}
      defaultValues={accountToFormValues(selectedAccount)}
      typeDisabled
      nameOptional={!!selectedAccount.code}
      namePlaceholder={
        selectedAccount.code ? accountName(selectedAccount) : undefined
      }
    />
  ) : null;

  const dialogs = (
    <>
      <AccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ledgerId={activeLedger?.id ?? ""}
      />
      {createParent && (
        <AccountDialog
          open={!!createParent}
          onOpenChange={(open) => !open && setCreateParent(null)}
          ledgerId={activeLedger?.id ?? ""}
          parent={createParent}
        />
      )}
      {balanceAccount && (
        <BalanceDialog
          open={!!balanceAccount}
          onOpenChange={(open) => !open && setBalanceAccount(null)}
          ledgerId={activeLedger?.id ?? ""}
          account={balanceAccount}
        />
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        {treePane}
        <Sheet
          open={!!selectedAccount}
          onOpenChange={(open) => !open && setSelectedId(null)}
        >
          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>
                {selectedAccount ? accountName(selectedAccount) : null}
              </SheetTitle>
              <SheetDescription>{t("editDescription")}</SheetDescription>
            </SheetHeader>
            <SheetBody>{editContent}</SheetBody>
            <SheetFooter>
              <Button onClick={handleEditSave} disabled={saving || !canManage}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("save")}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        {treePane}
        <div className="flex min-h-0 w-96 shrink-0 flex-col">
          {selectedAccount ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                {selectedAccount.icon && (
                  <span aria-hidden>{selectedAccount.icon}</span>
                )}
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                  {accountName(selectedAccount)}
                </h3>
                <Badge
                  variant="outline"
                  className={TYPE_BADGE[selectedAccount.type]}
                >
                  {t(`types.${selectedAccount.type}`)}
                </Badge>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {editContent}
              </div>
              {canManage && (
                <div className="border-t p-4">
                  <Button
                    className="w-full"
                    onClick={handleEditSave}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {saving ? t("saving") : t("save")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-8 text-center text-muted-foreground">
              {t("selectToEdit")}
            </div>
          )}
        </div>
      </div>
      {dialogs}
    </>
  );
}
