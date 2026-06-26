"use client";

import {
  Button,
  Checkbox,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, UserMinus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient, withApiFeedback } from "@/lib/api";

interface MemberUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface PositionMember {
  id: string;
  userId: string;
  role: string;
  departmentId: string | null;
  positions?: { id: string; name: string; code: string }[];
  createdAt: string;
  user: MemberUser;
}

interface PositionMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  positionId: string;
  positionName: string;
}

export function PositionMembersDialog({
  open,
  onOpenChange,
  orgId,
  positionId,
  positionName,
}: PositionMembersDialogProps) {
  const t = useTranslations("Positions");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["position-members", orgId, positionId],
    enabled: open,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].positions[":id"].members.$get,
      )({ param: { orgId, id: positionId } });
      const data = await res.json();
      return data.members as PositionMember[];
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      // Get member's current positions and remove the current position
      const member = members?.find((m) => m.id === memberId);
      if (!member) return;

      // Get current positions (excluding the one we're removing)
      const currentPositionIds =
        member.positions?.filter((p) => p.id !== positionId).map((p) => p.id) ??
        [];

      await withApiFeedback(
        appClient.api.organizations[":orgId"].members[":memberId"].positions
          .$put,
      )({
        param: { orgId, memberId },
        json: { positionIds: currentPositionIds },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["position-members", orgId, positionId],
      });
      queryClient.invalidateQueries({ queryKey: ["positions", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      toast.success(t("memberRemovedFromPosition"));
    },
  });

  async function handleRemoveMember(member: PositionMember) {
    const confirmed = await confirm({
      title: t("removeMemberFromPosition"),
      description: t("removeMemberFromPositionDescription", {
        name: member.user.name,
      }),
      confirmLabel: t("remove"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    removeMemberMutation.mutate(member.id);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {t("manageMembers")} — {positionName}
            </SheetTitle>
            <SheetDescription>{t("manageMembersDescription")}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {isLoading ? (
              <div className="flex min-h-[100px] items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Users className="h-4 w-4" />
                    {t("addMember")}
                  </Button>
                </div>
                {!members || members.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground">
                    {t("noMembersWithPosition")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{member.user.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {member.user.email}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title={t("remove")}
                          onClick={() => handleRemoveMember(member)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
      <AddMemberToPositionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orgId={orgId}
        positionId={positionId}
        currentMemberIds={members?.map((m) => m.id) ?? []}
      />
    </>
  );
}

interface AddMemberToPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  positionId: string;
  currentMemberIds: string[];
}

function AddMemberToPositionDialog({
  open,
  onOpenChange,
  orgId,
  positionId,
  currentMemberIds,
}: AddMemberToPositionDialogProps) {
  const t = useTranslations("Positions");
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: allMembers, isLoading } = useQuery({
    queryKey: ["organization-members", orgId],
    enabled: open,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":id"].members.$get,
      )({
        param: { id: orgId },
        query: { limit: 100, offset: 0 },
      });
      const data = await res.json();
      return data.members as PositionMember[];
    },
  });

  const availableMembers =
    allMembers?.filter((m) => !currentMemberIds.includes(m.id)) ?? [];

  const allSelected =
    availableMembers.length > 0 &&
    availableMembers.every((m) => selectedIds.has(m.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableMembers.map((m) => m.id)));
    }
  }

  function toggleMember(memberId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  const addMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      // For each member, get their current positions and add the new one
      for (const memberId of memberIds) {
        const member = allMembers?.find((m) => m.id === memberId);
        if (!member) continue;

        // Get current positions from the member data
        const currentPositions = member.positions?.map((p) => p.id) ?? [];

        // Add the new position if not already present
        const newPositionIds = currentPositions.includes(positionId)
          ? currentPositions
          : [...currentPositions, positionId];

        await withApiFeedback(
          appClient.api.organizations[":orgId"].members[":memberId"].positions
            .$put,
        )({
          param: { orgId, memberId },
          json: { positionIds: newPositionIds },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["position-members", orgId, positionId],
      });
      queryClient.invalidateQueries({ queryKey: ["positions", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      toast.success(t("membersAddedToPosition"));
      setSelectedIds(new Set());
      onOpenChange(false);
    },
  });

  function handleAddSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    addMembersMutation.mutate(ids);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("addMember")}</SheetTitle>
          <SheetDescription>
            {t("addMemberToPositionDescription")}
          </SheetDescription>
          {availableMembers.length > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                {allSelected ? t("selectNone") : t("selectAll")}
              </span>
            </div>
          )}
        </SheetHeader>
        <SheetBody>
          {isLoading ? (
            <div className="flex min-h-[100px] items-center justify-center">
              <Spinner />
            </div>
          ) : availableMembers.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">
              {t("noAvailableMembers")}
            </div>
          ) : (
            <div className="space-y-2">
              {availableMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <Checkbox
                    checked={selectedIds.has(member.id)}
                    onCheckedChange={() => toggleMember(member.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{member.user.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {member.user.email}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetBody>
        {selectedIds.size > 0 && (
          <SheetFooter>
            <Button
              onClick={handleAddSelected}
              disabled={addMembersMutation.isPending}
            >
              {addMembersMutation.isPending
                ? t("saving")
                : t("addSelected", { count: selectedIds.size })}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
