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
import { Plus, UserMinus, Users } from "lucide-react";
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

interface DepartmentMember {
  id: string;
  userId: string;
  role: string;
  departmentId: string | null;
  createdAt: string;
  user: MemberUser;
}

interface DepartmentMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  departmentId: string;
  departmentName: string;
}

export function DepartmentMembersDialog({
  open,
  onOpenChange,
  orgId,
  departmentId,
  departmentName,
}: DepartmentMembersDialogProps) {
  const t = useTranslations("Departments");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["department-members", orgId, departmentId],
    enabled: open,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].members.$get,
      )({
        param: { orgId },
        query: { limit: 100, offset: 0, departmentId },
      });
      const data = await res.json();
      return data.members as DepartmentMember[];
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].members[":memberId"].$patch,
      )({
        param: { orgId, memberId },
        json: { departmentId: null },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["department-members", orgId, departmentId],
      });
      queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      toast.success(t("memberUnassigned"));
    },
  });

  async function handleUnassign(member: DepartmentMember) {
    const confirmed = await confirm({
      title: t("unassignMember"),
      description: t("unassignMemberDescription", { name: member.user.name }),
      confirmLabel: t("unassign"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    unassignMutation.mutate(member.id);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("manageMembers")} — {departmentName}
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
                    <Plus className="h-4 w-4" />
                    {t("addMember")}
                  </Button>
                </div>
                {!members || members.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground">
                    {t("noMembersInDepartment")}
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
                          title={t("unassign")}
                          onClick={() => handleUnassign(member)}
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
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orgId={orgId}
        departmentId={departmentId}
        excludeMemberIds={members?.map((m) => m.id) ?? []}
      />
    </>
  );
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  departmentId: string;
  excludeMemberIds: string[];
}

function AddMemberDialog({
  open,
  onOpenChange,
  orgId,
  departmentId,
  excludeMemberIds,
}: AddMemberDialogProps) {
  const t = useTranslations("Departments");
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: allMembers, isLoading } = useQuery({
    queryKey: ["organization-members", orgId],
    enabled: open,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].members.$get,
      )({
        param: { orgId },
        query: { limit: 100, offset: 0 },
      });
      const data = await res.json();
      return data.members as DepartmentMember[];
    },
  });

  const availableMembers =
    allMembers?.filter(
      (m) => !excludeMemberIds.includes(m.id) && !m.departmentId,
    ) ?? [];

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

  const batchAssignMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].members.batch.$patch,
      )({
        param: { orgId },
        json: { memberIds: ids, departmentId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["department-members", orgId, departmentId],
      });
      queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      toast.success(t("membersAssigned"));
      setSelectedIds(new Set());
      onOpenChange(false);
    },
  });

  function handleAddSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    batchAssignMutation.mutate(ids);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("addMember")}</SheetTitle>
          <SheetDescription>{t("addMemberDescription")}</SheetDescription>
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
              disabled={batchAssignMutation.isPending}
            >
              {batchAssignMutation.isPending
                ? t("saving")
                : t("addSelected", { count: selectedIds.size })}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
