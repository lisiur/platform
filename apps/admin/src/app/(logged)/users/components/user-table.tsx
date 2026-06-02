"use client";

import { isBuiltinUser } from "@repo/shared";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PaginatedTableFrame } from "@/components/paginated-table-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/hooks/use-confirm";
import { usePaginatedApiQuery } from "@/hooks/use-paginated-api-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { UserDialog } from "./user-dialog";

interface Role {
  id: string;
  appId: string;
  name: string;
  code: string;
}

interface UserRole {
  id: string;
  roleId: string;
  role: Role;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  flags?: string[] | null;
  createdAt: string;
  updatedAt: string;
  userRoles?: UserRole[];
}

export function UserTable() {
  const t = useTranslations("Users");
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const fetchUsersPage = useCallback(
    async ({ limit, offset }: { limit: number; offset: number }) => {
      const res = await withApiFeedback(appClient.api.users.$get)({
        query: {
          limit,
          offset,
        },
      });

      const data = await res.json();
      return { items: data.users, total: data.total };
    },
    [],
  );

  const {
    items: users,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh: fetchUsers,
  } = usePaginatedApiQuery<UserRow>({ fetchPage: fetchUsersPage });

  function handleEditSuccess() {
    setEditUser(null);
    fetchUsers();
    toast.success(t("updateSuccess"));
  }

  function handleCreateSuccess() {
    setShowCreate(false);
    fetchUsers();
    toast.success(t("createSuccess"));
  }

  async function handleDelete(user: UserRow) {
    const confirmed = await confirm({
      title: t("deleteUser"),
      description: (
        <>
          {t("confirmDelete")} <strong>{user.name}</strong>?
        </>
      ),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(appClient.api.users[":id"].$delete)({
        param: { id: user.id },
      });
      fetchUsers();
      toast.success(t("deleteSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={users.length === 0}
        emptyMessage={t("noUsers")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex w-full justify-end">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("addUser")}
            </Button>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("roles")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableHead sticky="right" align="right">
              {t("actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const builtinUser = isBuiltinUser(user.flags);

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{user.name}</span>
                    {builtinUser && (
                      <Badge
                        variant="secondary"
                        className="px-1.5"
                        title={t("protected")}
                        aria-label={t("protected")}
                      >
                        <ShieldCheck className="h-3 w-3" />
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.userRoles && user.userRoles.length > 0 ? (
                      user.userRoles.map((ur) => (
                        <Badge key={ur.id} variant="secondary">
                          {ur.role.name}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">{t("noRoles")}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.banned ? "destructive" : "outline"}>
                    {user.banned ? t("banned") : t("active")}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell sticky="right" align="right">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={
                      builtinUser ? t("protectedActionDisabled") : undefined
                    }
                    onClick={() => setEditUser(user)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={
                      builtinUser ? t("protectedActionDisabled") : undefined
                    }
                    disabled={builtinUser}
                    onClick={() => handleDelete(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </PaginatedTableFrame>

      {showCreate && (
        <UserDialog
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editUser && (
        <UserDialog
          user={editUser}
          open={!!editUser}
          onOpenChange={(open) => !open && setEditUser(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}
