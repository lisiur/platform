"use client";

import type { UserWithRole } from "better-auth/plugins";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { UserDialog } from "./user-dialog";

export function UserTable() {
  const t = useTranslations("Users");
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserWithRole | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserWithRole | null>(null);

  const pageSize = 10;
  const offset = (page - 1) * pageSize;
  const totalPages = Math.ceil(total / pageSize);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset,
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
  }, [offset, t]);

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
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === "admin" ? "default" : "outline"}>
                  {user.role ?? "user"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.banned ? "destructive" : "outline"}>
                  {user.banned ? t("banned") : t("active")}
                </Badge>
              </TableCell>
              <TableCell>
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditUser(user)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteUser(user)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            {t("showing")} {offset + 1}-{Math.min(offset + pageSize, total)}{" "}
            {t("of")} {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("next")}
            </Button>
          </div>
        </div>
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
