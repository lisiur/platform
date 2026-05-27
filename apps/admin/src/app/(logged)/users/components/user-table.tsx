"use client";

import { isBuiltinUser } from "@repo/shared";
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
import { appClient } from "@/lib/api";
import { formatDate } from "@/utils/date";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
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
      const res = await appClient.api["admin-users"].$get({
        query: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotal(data.total);
      } else {
        toast.error(t("fetchFailed"));
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
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
        {t("noUsers")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addUser")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-col">
        <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background">
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
            className="shrink-0"
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </div>

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
    </div>
  );
}
