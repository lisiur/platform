"use client";

import { isProtectedUser } from "@repo/shared";
import type { UserWithRole } from "better-auth/plugins";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/api";
import { formatDate } from "@/utils/date";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { UserDialog } from "./user-dialog";

type UserRow = UserWithRole & {
  flags?: string[] | null;
};

export function UserTable() {
  const t = useTranslations("Users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  const pageSize = 10;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
      });
      if (result.data) {
        setUsers(result.data.users);
        setTotal(result.data.total);
      }
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  function handleDeleteSuccess() {
    setDeleteUser(null);
    fetchUsers();
    toast.success(t("deleteSuccess"));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t("noUsers")}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addUser")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const protectedUser = isProtectedUser(user.flags);

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{user.name}</span>
                    {protectedUser && (
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
                  <Badge
                    variant={user.role === "admin" ? "default" : "outline"}
                  >
                    {t(user.role === "admin" ? "roles.admin" : "roles.user")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.banned ? "destructive" : "outline"}>
                    {user.banned ? t("banned") : t("active")}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={
                      protectedUser ? t("protectedActionDisabled") : undefined
                    }
                    onClick={() => setEditUser(user)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={
                      protectedUser ? t("protectedActionDisabled") : undefined
                    }
                    disabled={protectedUser}
                    onClick={() => setDeleteUser(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {total > pageSize && (
        <DataTablePagination
          page={page}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

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

      {deleteUser && (
        <DeleteConfirmDialog
          user={deleteUser}
          open={!!deleteUser}
          onOpenChange={(open) => !open && setDeleteUser(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  );
}
