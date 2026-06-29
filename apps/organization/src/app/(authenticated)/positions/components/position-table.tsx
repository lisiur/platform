"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  Spinner,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Shield, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatDate } from "@/utils/date";
import { PositionDialog } from "./position-dialog";
import { PositionMembersDialog } from "./position-members-dialog";
import { PositionPermissionsDialog } from "./position-permissions-dialog";

interface PositionRow {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string | null;
  sortOrder: number;
  membersCount: number;
  permissionsCount: number;
  createdAt: string;
}

interface PositionTableProps {
  orgId: string;
}

export function PositionTable({ orgId }: PositionTableProps) {
  const t = useTranslations("Positions");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPosition, setEditPosition] = useState<PositionRow | null>(null);
  const [manageMembersPosition, setManageMembersPosition] =
    useState<PositionRow | null>(null);
  const [managePermissionsPosition, setManagePermissionsPosition] =
    useState<PositionRow | null>(null);

  const { data: positions, isLoading } = useQuery({
    queryKey: ["positions", orgId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].positions.$get,
      )({ param: { orgId } });
      const data = await res.json();
      return data.positions as PositionRow[];
    },
  });

  async function handleDelete(position: PositionRow) {
    const confirmed = await confirm({
      title: t("confirmDeleteTitle"),
      description: t("confirmDeleteDescription", { name: position.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].positions[":id"].$delete,
      )({
        param: { orgId, id: position.id },
      });
      queryClient.invalidateQueries({ queryKey: ["positions", orgId] });
      toast.success(t("deleteSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 shrink-0">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("createPosition")}
        </Button>
      </div>
      {positions?.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full caption-bottom text-sm">
            <TableHeader sticky>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("description_label")}</TableHead>
                <TableHead>{t("membersCount")}</TableHead>
                <TableHead>{t("permissions")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead sticky="right" align="right">
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions?.map((position) => (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{position.code}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {position.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {position.membersCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <Shield className="mr-1 h-3 w-3" />
                      {position.permissionsCount}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(position.createdAt)}</TableCell>
                  <TableCell sticky="right" align="right">
                    <ButtonGroup className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManageMembersPosition(position);
                        }}
                      >
                        <Users />
                        {t("manageMembers")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagePermissionsPosition(position);
                        }}
                      >
                        <Shield />
                        {t("managePermissions")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditPosition(position);
                        }}
                      >
                        <Pencil />
                        {t("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(position);
                        }}
                      >
                        <Trash2 />
                        {t("delete")}
                      </Button>
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      <PositionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
      />
      {editPosition && (
        <PositionDialog
          open={!!editPosition}
          onOpenChange={(open) => !open && setEditPosition(null)}
          orgId={orgId}
          position={editPosition}
        />
      )}
      {manageMembersPosition && (
        <PositionMembersDialog
          open={!!manageMembersPosition}
          onOpenChange={(open) => !open && setManageMembersPosition(null)}
          orgId={orgId}
          positionId={manageMembersPosition.id}
          positionName={manageMembersPosition.name}
        />
      )}
      {managePermissionsPosition && (
        <PositionPermissionsDialog
          open={!!managePermissionsPosition}
          onOpenChange={(open) => !open && setManagePermissionsPosition(null)}
          orgId={orgId}
          positionId={managePermissionsPosition.id}
          positionName={managePermissionsPosition.name}
        />
      )}
    </>
  );
}
