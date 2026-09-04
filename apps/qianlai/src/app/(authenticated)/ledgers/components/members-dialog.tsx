"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
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
import { Crown, Pencil, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
    isVirtual?: boolean;
  } | null;
}

const virtualMemberFormSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

type VirtualMemberFormData = z.infer<typeof virtualMemberFormSchema>;

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
  const [renameTarget, setRenameTarget] = useState<MemberRow | null>(null);

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
    queryClient.invalidateQueries({
      queryKey: ["qianlai", "member-turnover", ledgerId],
    });
  }

  const addVirtualMemberForm = useForm<VirtualMemberFormData>({
    resolver: zodResolver(virtualMemberFormSchema),
    defaultValues: { name: "" },
  });

  const addVirtualMember = useMutation({
    mutationFn: async (data: VirtualMemberFormData) => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members.$post,
      )({ param: { ledgerId }, json: { name: data.name.trim() } });
      return (await res.json()) as MemberRow;
    },
    onSuccess: (member) => {
      invalidate();
      toast.success(
        t("addVirtualMemberSuccess", { name: member.user?.name ?? "" }),
      );
      addVirtualMemberForm.reset();
    },
  });

  const renameMemberForm = useForm<VirtualMemberFormData>({
    resolver: zodResolver(virtualMemberFormSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (renameTarget) {
      renameMemberForm.reset({ name: renameTarget.user?.name ?? "" });
    }
  }, [renameTarget, renameMemberForm]);

  const renameMember = useMutation({
    mutationFn: async ({
      member,
      name,
    }: {
      member: MemberRow;
      name: string;
    }) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members[":userId"]
          .$patch,
      )({ param: { ledgerId, userId: member.userId }, json: { name } });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("renameMemberSuccess"));
      setRenameTarget(null);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (member: MemberRow) => {
      const confirmed = await confirm({
        title: t("removeMember"),
        description: member.user?.isVirtual
          ? t("confirmRemoveVirtualMember", {
              name: member.user?.name ?? member.userId,
            })
          : t("confirmRemoveMember", {
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

  const updateMember = useMutation({
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
  const isEditorial = isOwner
    ? true
    : members.some((m) => m.userId === myUserId && m.role === "editor");
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
                {members.map((member) => {
                  const isSelf = member.userId === myUserId;
                  const isVirtual = member.user?.isVirtual === true;
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {member.user?.name ?? member.userId}
                            {isVirtual && (
                              <Badge
                                variant="secondary"
                                className="ml-1.5 align-middle"
                              >
                                {t("virtualBadge")}
                              </Badge>
                            )}
                            {!isVirtual && isSelf && (
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({t("you")})
                              </span>
                            )}
                          </span>
                          {isOwner && !isVirtual && member.user?.email && (
                            <span className="text-muted-foreground text-xs">
                              {member.user.email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isVirtual ? (
                          // A virtual member can never sign in, so its role
                          // stays a fixed "viewer" — badge, not a control.
                          <Badge variant="outline">{t("viewer")}</Badge>
                        ) : isOwner && member.role !== "owner" && !isSelf ? (
                          <Select
                            value={member.role}
                            onValueChange={(v) => {
                              if (v === "editor" || v === "viewer") {
                                updateMember.mutate({
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
                        <div className="flex justify-end gap-1">
                          {isVirtual && isEditorial && (
                            <TooltipButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("renameMember")}
                              tooltip={t("renameMember")}
                              onClick={() => setRenameTarget(member)}
                            >
                              <Pencil />
                            </TooltipButton>
                          )}
                          {isOwner && !isSelf && !isVirtual && (
                            <TooltipButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("transferOwnership")}
                              tooltip={t("transferOwnership")}
                              onClick={() => transferOwnership.mutate(member)}
                            >
                              <Crown />
                            </TooltipButton>
                          )}
                          {isOwner && !isSelf && (
                            <TooltipButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("removeMember")}
                              tooltip={t("removeMember")}
                              onClick={() => removeMember.mutate(member)}
                            >
                              <Trash2 />
                            </TooltipButton>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {isEditorial && (
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold">{t("addVirtualMember")}</h4>
                <p className="text-muted-foreground text-sm">
                  {t("addVirtualMemberDescription")}
                </p>
              </div>
              <form
                id="add-virtual-member-form"
                onSubmit={addVirtualMemberForm.handleSubmit((data) =>
                  addVirtualMember.mutate(data),
                )}
                className="flex items-start gap-2"
              >
                <Field
                  data-invalid={!!addVirtualMemberForm.formState.errors.name}
                  className="flex-1"
                >
                  <FieldLabel htmlFor="virtual-member-name" className="sr-only">
                    {t("name")}
                  </FieldLabel>
                  <Input
                    id="virtual-member-name"
                    aria-invalid={!!addVirtualMemberForm.formState.errors.name}
                    {...addVirtualMemberForm.register("name")}
                    placeholder={t("virtualMemberNamePlaceholder")}
                    maxLength={50}
                  />
                  <FieldError
                    errors={
                      addVirtualMemberForm.formState.errors.name
                        ? [addVirtualMemberForm.formState.errors.name]
                        : undefined
                    }
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={addVirtualMember.isPending}
                  className="shrink-0"
                >
                  <UserPlus className="mr-1 h-4 w-4" />
                  {t("addVirtualMember")}
                </Button>
              </form>
              <p className="text-muted-foreground text-xs">
                {t("virtualMemberHint")}
              </p>
            </div>
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

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(next) => !next && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameMember")}</DialogTitle>
            <DialogDescription>
              {renameTarget?.user?.name ?? renameTarget?.userId}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              id="rename-virtual-member-form"
              onSubmit={renameMemberForm.handleSubmit((data) => {
                if (renameTarget) {
                  renameMember.mutate({
                    member: renameTarget,
                    name: data.name.trim(),
                  });
                }
              })}
              className="space-y-4"
            >
              <FieldGroup>
                <Field data-invalid={!!renameMemberForm.formState.errors.name}>
                  <FieldLabel htmlFor="rename-member-name" required>
                    {t("name")}
                  </FieldLabel>
                  <Input
                    id="rename-member-name"
                    aria-invalid={!!renameMemberForm.formState.errors.name}
                    {...renameMemberForm.register("name")}
                    maxLength={50}
                  />
                  <FieldError
                    errors={
                      renameMemberForm.formState.errors.name
                        ? [renameMemberForm.formState.errors.name]
                        : undefined
                    }
                  />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              form="rename-virtual-member-form"
              disabled={renameMember.isPending}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
