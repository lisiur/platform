"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenuItem,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  LogOut,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { type QianlaiLedger, useLedgers } from "@/hooks/use-ledgers";
import { appClient, withApiFeedback } from "@/lib/api";
import { useLedgerStore } from "@/stores/ledger-store";
import { JoinLedgerDialog } from "./join-dialog";
import { LedgerDialog } from "./ledger-dialog";
import { MembersDialog } from "./members-dialog";

export function LedgersTable() {
  const t = useTranslations("Ledgers");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { ledgers, activeLedger, isLoading } = useLedgers();
  const setActiveLedger = useLedgerStore((s) => s.setActiveLedger);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [editLedger, setEditLedger] = useState<QianlaiLedger | null>(null);
  const [membersLedger, setMembersLedger] = useState<QianlaiLedger | null>(
    null,
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["qianlai", "ledgers"] });
  }

  const setDefault = useMutation({
    mutationFn: async (ledger: QianlaiLedger) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":id"].default.$post,
      )({ param: { id: ledger.id } });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("updateSuccess"));
    },
  });

  const archiveToggle = useMutation({
    mutationFn: async (ledger: QianlaiLedger) => {
      const archiving = ledger.status === "active";
      await withApiFeedback(appClient.api.bookkeeping.ledgers[":id"].$patch)({
        param: { id: ledger.id },
        json: { status: archiving ? "archived" : "active" },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("archiveSuccess"));
    },
  });

  const remove = useMutation({
    mutationFn: async (ledger: QianlaiLedger) => {
      const confirmed = await confirm({
        title: t("confirmDeleteTitle"),
        description: t("confirmDeleteDescription", { name: ledger.name }),
        confirmLabel: t("delete"),
        cancelLabel: t("cancel"),
      });
      if (!confirmed) return;
      await withApiFeedback(appClient.api.bookkeeping.ledgers[":id"].$delete)({
        param: { id: ledger.id },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("deleteSuccess"));
    },
  });

  const leave = useMutation({
    mutationFn: async (ledger: QianlaiLedger) => {
      const confirmed = await confirm({
        title: t("leave"),
        description: t("confirmLeave"),
        confirmLabel: t("leave"),
        cancelLabel: t("cancel"),
      });
      if (!confirmed) return;
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].leave.$post,
      )({ param: { ledgerId: ledger.id } });
    },
    onSuccess: () => {
      setActiveLedger(null);
      invalidate();
      toast.success(t("leaveSuccess"));
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex shrink-0 gap-2">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
        <Button variant="outline" onClick={() => setJoinOpen(true)}>
          {t("join")}
        </Button>
      </div>
      {ledgers.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <Table containerClassName="overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("currency")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{t("members")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgers.map((ledger) => {
              const isOwner = ledger.myRole === "owner";
              const isActive = ledger.id === activeLedger?.id;
              return (
                <TableRow key={ledger.id} data-active={isActive}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {ledger.name}
                      {ledger.isDefault && (
                        <Badge variant="secondary">
                          <Star className="mr-1 h-3 w-3" />
                          {t("default")}
                        </Badge>
                      )}
                      {ledger.shared && (
                        <Badge variant="outline">{t("shared")}</Badge>
                      )}
                    </div>
                    {ledger.description && (
                      <span className="text-muted-foreground line-clamp-1 text-xs">
                        {ledger.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{ledger.currency}</TableCell>
                  <TableCell>{t(ledger.myRole)}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {ledger.membersCount}
                  </TableCell>
                  <TableCell>
                    {ledger.status === "active" ? t("active") : t("archive")}
                  </TableCell>
                  <TableActionCell
                    menuLabel={t("actions")}
                    menu={
                      <>
                        <DropdownMenuItem
                          onClick={() => setMembersLedger(ledger)}
                        >
                          <Users />
                          {t("membersTitle")}
                        </DropdownMenuItem>
                        {isOwner && (
                          <>
                            <DropdownMenuItem
                              onClick={() => setEditLedger(ledger)}
                            >
                              <Pencil />
                              {t("edit")}
                            </DropdownMenuItem>
                            {!ledger.isDefault && (
                              <DropdownMenuItem
                                onClick={() => setDefault.mutate(ledger)}
                              >
                                <Star />
                                {t("setDefault")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => archiveToggle.mutate(ledger)}
                            >
                              {ledger.status === "active" ? (
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
                              onClick={() => remove.mutate(ledger)}
                            >
                              <Trash2 />
                              {t("delete")}
                            </DropdownMenuItem>
                          </>
                        )}
                        {!isOwner && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => leave.mutate(ledger)}
                          >
                            <LogOut />
                            {t("leave")}
                          </DropdownMenuItem>
                        )}
                      </>
                    }
                  >
                    <ButtonGroup className="ml-auto">
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("membersTitle")}
                        tooltip={t("membersTitle")}
                        onClick={() => setMembersLedger(ledger)}
                      >
                        <Users />
                      </TooltipButton>
                      {isOwner && (
                        <>
                          <TooltipButton
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("edit")}
                            tooltip={t("edit")}
                            onClick={() => setEditLedger(ledger)}
                          >
                            <Pencil />
                          </TooltipButton>
                          <TooltipButton
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("delete")}
                            tooltip={t("delete")}
                            onClick={() => remove.mutate(ledger)}
                          >
                            <Trash2 />
                          </TooltipButton>
                        </>
                      )}
                    </ButtonGroup>
                  </TableActionCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <LedgerDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinLedgerDialog open={joinOpen} onOpenChange={setJoinOpen} />
      {editLedger && (
        <LedgerDialog
          open={!!editLedger}
          onOpenChange={(open) => !open && setEditLedger(null)}
          ledger={editLedger}
        />
      )}
      {membersLedger && (
        <MembersDialog
          open={!!membersLedger}
          onOpenChange={(open) => !open && setMembersLedger(null)}
          ledgerId={membersLedger.id}
        />
      )}
    </>
  );
}
