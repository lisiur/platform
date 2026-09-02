"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { type InviteCodeRow, LiveInvite } from "@/components/live-invite";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient, useSession, withApiFeedback } from "@/lib/api";

interface MemberRow {
  id: string;
  ledgerId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
  } | null;
}

interface MembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
}

export function MembersDialog({
  open,
  onOpenChange,
  ledgerId,
}: MembersDialogProps) {
  const t = useTranslations("Ledgers");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: session } = useSession();
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("editor");

  const { data: membersData, isLoading } = useQuery({
    queryKey: ["qianlai", "members", ledgerId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members.$get,
      )({ param: { ledgerId } });
      return (await res.json()) as { members: MemberRow[] };
    },
    enabled: open,
  });

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: ["qianlai", "members", ledgerId],
    });
    queryClient.invalidateQueries({ queryKey: ["qianlai", "ledgers"] });
  }

  const removeMember = useMutation({
    mutationFn: async (member: MemberRow) => {
      const confirmed = await confirm({
        title: t("removeMember"),
        description: t("confirmRemoveMember", {
          name: member.user?.name ?? member.userId,
        }),
        confirmLabel: t("removeMember"),
        cancelLabel: t("cancel"),
      });
      if (!confirmed) return;
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members[":userId"]
          .$delete,
      )({ param: { ledgerId, userId: member.userId } });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("removeMemberSuccess"));
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({
      member,
      role,
    }: {
      member: MemberRow;
      role: "editor" | "viewer";
    }) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members[":userId"]
          .$patch,
      )({ param: { ledgerId, userId: member.userId }, json: { role } });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("roleUpdated"));
    },
  });

  const transferOwnership = useMutation({
    mutationFn: async (member: MemberRow) => {
      const confirmed = await confirm({
        title: t("transferOwnership"),
        description: t("confirmTransfer", { name: member.user?.name ?? "" }),
        confirmLabel: t("transferOwnership"),
        cancelLabel: t("cancel"),
      });
      if (!confirmed) return;
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].transfer.$post,
      )({ param: { ledgerId }, json: { userId: member.userId } });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("transferSuccess"));
    },
  });

  const mintInvite = useCallback(async () => {
    const res = await withApiFeedback(
      appClient.api.bookkeeping.ledgers[":ledgerId"]["share-codes"].$post,
      // The LiveInvite panel renders the error inline; a background
      // re-mint failing shouldn't toast.
      { showError: false },
    )({ param: { ledgerId }, json: { role: shareRole } });
    return (await res.json()) as InviteCodeRow;
  }, [ledgerId, shareRole]);

  const myUserId = session?.user.id;
  const members = membersData?.members ?? [];
  const isOwner = members.some(
    (m) => m.userId === myUserId && m.role === "owner",
  );
  const roleItems = [
    { value: "editor", label: t("editor") },
    { value: "viewer", label: t("viewer") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("membersTitle")}</DialogTitle>
          <DialogDescription>{t("membersDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          {isLoading ? (
            <div className="flex min-h-[120px] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <Table containerClassName="overflow-auto rounded-md border">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground py-6 text-center"
                    >
                      {t("noMembers")}
                    </TableCell>
                  </TableRow>
                )}
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {member.user?.name ?? member.userId}
                          {member.userId === myUserId && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              ({t("you")})
                            </span>
                          )}
                        </span>
                        {isOwner && member.user?.email && (
                          <span className="text-muted-foreground text-xs">
                            {member.user.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isOwner &&
                      member.role !== "owner" &&
                      member.userId !== myUserId ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) => {
                            if (v === "editor" || v === "viewer") {
                              updateMemberRole.mutate({
                                member,
                                role: v,
                              });
                            }
                          }}
                          items={roleItems}
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">
                              {t("editor")}
                            </SelectItem>
                            <SelectItem value="viewer">
                              {t("viewer")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">
                          {member.role === "owner" && (
                            <Crown className="mr-1 h-3 w-3" />
                          )}
                          {t(member.role)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isOwner && member.userId !== myUserId && (
                        <div className="flex justify-end gap-1">
                          <TooltipButton
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("transferOwnership")}
                            tooltip={t("transferOwnership")}
                            onClick={() => transferOwnership.mutate(member)}
                          >
                            <Crown />
                          </TooltipButton>
                          <TooltipButton
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("removeMember")}
                            tooltip={t("removeMember")}
                            onClick={() => removeMember.mutate(member)}
                          >
                            <Trash2 />
                          </TooltipButton>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {isOwner && (
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold">{t("inviteTitle")}</h4>
                <p className="text-muted-foreground text-sm">
                  {t("inviteDescription")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={shareRole}
                  onValueChange={(v) =>
                    v !== null && setShareRole(v as "editor" | "viewer")
                  }
                  items={roleItems}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">{t("editor")}</SelectItem>
                    <SelectItem value="viewer">{t("viewer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-muted-foreground text-xs">
                {t("shareRoleHint")}
              </p>
              <LiveInvite mint={mintInvite} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
