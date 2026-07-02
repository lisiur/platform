"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import { isBuiltinUser } from "@repo/shared";
import {
  Badge,
  Button,
  ButtonGroup,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { Pencil, Plus, ShieldUser, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
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

  const {
    items: users,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh: fetchUsers,
  } = usePaginatedQuery<UserRow>({
    queryKey: ["users"],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.users.$get)({
        query: { limit, offset },
      });
      const data = await res.json();
      return { items: data.users, total: data.total };
    },
  });

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
              <Plus className="h-4 w-4" />
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
                        <ShieldUser className="h-3 w-3" />
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
                  <ButtonGroup className="ml-auto">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("edit")}
                            onClick={() => setEditUser(user)}
                          >
                            <Pencil />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("edit")}</TooltipContent>
                    </Tooltip>
                    {builtinUser ? (
                      <Button variant="ghost" size="icon-sm" disabled>
                        <Trash2 />
                      </Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("delete")}
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 />
                            </Button>
                          }
                        />
                        <TooltipContent>{t("delete")}</TooltipContent>
                      </Tooltip>
                    )}
                  </ButtonGroup>
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
