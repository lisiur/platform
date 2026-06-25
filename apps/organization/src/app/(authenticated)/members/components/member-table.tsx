"use client";

import {
  Badge,
  Button,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { PaginatedTableFrame } from "@/components/paginated-table-frame";
import { useConfirm } from "@/hooks/use-confirm";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient, useSession } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

interface MemberUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface MemberRow {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: MemberUser;
}

export function MemberTable({ organizationId }: { organizationId: string }) {
  const t = useTranslations("Members");
  const confirm = useConfirm();
  const { data: session } = useSession();
  const currentUserId = session?.user.id;

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
        appClient.api.organizations[":id"].members.$get,
      )({
        param: { id: organizationId },
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
        appClient.api.organizations[":id"].members[":memberId"].$delete,
      )({
        param: { id: organizationId, memberId: member.id },
      });
      refresh();
      toast.success(t("removeSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  return (
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
              <TableCell>{formatDate(member.createdAt)}</TableCell>
              <TableCell sticky="right" align="right">
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("removeMember")}
                    disabled={isSelf}
                    onClick={() => handleRemove(member)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </PaginatedTableFrame>
  );
}
