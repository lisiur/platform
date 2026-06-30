"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { Briefcase, Building2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PaginatedTableFrame } from "@/components/paginated-table-frame";
import { useConfirm } from "@/hooks/use-confirm";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient, useSession } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { MemberDepartmentDialog } from "./member-department-dialog";
import { MemberPositionsDialog } from "./member-positions-dialog";

interface MemberUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface MemberPosition {
  id: string;
  name: string;
  code: string;
}

interface MemberRow {
  id: string;
  userId: string;
  role: string;
  departmentId?: string | null;
  positions?: MemberPosition[];
  createdAt: string;
  user: MemberUser;
  department?: { id: string; name: string } | null;
}

export function MemberTable({ organizationId }: { organizationId: string }) {
  const t = useTranslations("Members");
  const confirm = useConfirm();
  const { data: session } = useSession();
  const currentUserId = session?.user.id;
  const [managePositionsMember, setManagePositionsMember] =
    useState<MemberRow | null>(null);
  const [manageDepartmentMember, setManageDepartmentMember] =
    useState<MemberRow | null>(null);

  const {
    items: members,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<MemberRow>({
    queryKey: ["organization-members", organizationId],
    enabled: !!organizationId,
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].members.$get,
      )({
        param: { orgId: organizationId },
        query: { limit, offset },
      });
      const data = await res.json();
      return { items: data.members, total: data.total };
    },
  });

  const canManage = useMemo(
    () => members.find((m) => m.userId === currentUserId)?.role === "owner",
    [members, currentUserId],
  );

  function roleBadge(role: string) {
    return role === "owner" ? (
      <Badge>{t("roleOwner")}</Badge>
    ) : (
      <Badge variant="secondary">{t("roleMember")}</Badge>
    );
  }

  async function handleRemove(member: MemberRow) {
    const confirmed = await confirm({
      title: t("confirmRemove"),
      description: t("confirmRemoveDescription", { name: member.user.name }),
      confirmLabel: t("remove"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].members[":memberId"].$delete,
      )({
        param: { orgId: organizationId, memberId: member.id },
      });
      refresh();
      toast.success(t("removeSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={members.length === 0}
        emptyMessage={t("noMembers")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("department")}</TableHead>
            <TableHead>{t("positions")}</TableHead>
            <TableHead>{t("joinedAt")}</TableHead>
            <TableHead sticky="right" align="right">
              {t("actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{member.user.name}</span>
                    {isSelf && (
                      <Badge variant="outline" className="px-1.5">
                        {t("you")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{member.user.email}</TableCell>
                <TableCell>{roleBadge(member.role)}</TableCell>
                <TableCell>{member.department?.name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {member.positions?.map((pos) => (
                      <Badge key={pos.id} variant="outline">
                        {pos.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{formatDate(member.createdAt)}</TableCell>
                <TableCell sticky="right" align="right">
                  {canManage && (
                    <ButtonGroup className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManageDepartmentMember(member);
                        }}
                      >
                        <Building2 />
                        {t("manageDepartment")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagePositionsMember(member);
                        }}
                      >
                        <Briefcase />
                        {t("managePositions")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf}
                        onClick={() => handleRemove(member)}
                      >
                        <Trash2 />
                        {t("removeMember")}
                      </Button>
                    </ButtonGroup>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </PaginatedTableFrame>
      {managePositionsMember && (
        <MemberPositionsDialog
          open={!!managePositionsMember}
          onOpenChange={(open) => !open && setManagePositionsMember(null)}
          orgId={organizationId}
          memberId={managePositionsMember.id}
          memberName={managePositionsMember.user.name}
          currentPositions={managePositionsMember.positions ?? []}
        />
      )}
      {manageDepartmentMember && (
        <MemberDepartmentDialog
          open={!!manageDepartmentMember}
          onOpenChange={(open) => !open && setManageDepartmentMember(null)}
          orgId={organizationId}
          memberId={manageDepartmentMember.id}
          memberName={manageDepartmentMember.user.name}
          currentDepartmentId={manageDepartmentMember.departmentId ?? null}
        />
      )}
    </>
  );
}
