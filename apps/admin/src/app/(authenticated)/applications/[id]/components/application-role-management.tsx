"use client";

import { isBuiltinRole } from "@repo/shared";
import {
  Badge,
  Button,
  ButtonGroup,
  cn,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { ListChecks, Pencil, Plus, ShieldUser, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { RoleDialog } from "./role-dialog";
import { RolePermissionAssignment } from "./role-permission-assignment";

interface Role {
  id: string;
  appId: string;
  name: string;
  code: string;
  flags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ApplicationRoleManagementProps {
  appId: string;
  className?: string;
}

export function ApplicationRoleManagement({
  appId,
  className,
}: ApplicationRoleManagementProps) {
  const t = useTranslations("Roles");
  const rolePermissionsT = useTranslations("RolePermissions");
  const confirm = useConfirm();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissionDrawerOpen, setPermissionDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withApiFeedback(appClient.api.roles.$get)({
        query: { appId },
      });
      const data = await res.json();
      setRoles(data);
      setSelectedRole((current) => {
        if (current && data.some((role: Role) => role.id === current.id)) {
          return current;
        }
        return null;
      });
    } catch {
      setRoles([]);
      setSelectedRole(null);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  function handleCreateSuccess() {
    setShowCreate(false);
    fetchRoles();
    toast.success(t("createSuccess"));
  }

  function handleEditSuccess() {
    setEditRole(null);
    fetchRoles();
    toast.success(t("updateSuccess"));
  }

  async function handleDelete(role: Role) {
    const confirmed = await confirm({
      title: t("deleteRole"),
      description: (
        <>
          {t("confirmDelete")} <strong>{role.name}</strong>?
        </>
      ),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(appClient.api.roles[":id"].$delete)({
        param: { id: role.id },
      });
      fetchRoles();
      toast.success(t("deleteSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className={cn("flex min-h-0 flex-1 flex-col gap-4", className)}>
        <div className="flex shrink-0 justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("addRole")}
          </Button>
        </div>
        <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("code")}</TableHead>
              <TableHead sticky="right" align="right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => {
              const builtin = isBuiltinRole(role.flags);
              return (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{role.name}</span>
                      {builtin && (
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
                  <TableCell>
                    <Badge variant="secondary">{role.code}</Badge>
                  </TableCell>
                  <TableCell sticky="right" align="right">
                    <ButtonGroup className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={
                          builtin ? t("protectedActionDisabled") : undefined
                        }
                        disabled={builtin}
                        onClick={() => setEditRole(role)}
                      >
                        <Pencil />
                        {t("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRole(role);
                          setPermissionDrawerOpen(true);
                        }}
                      >
                        <ListChecks />
                        {t("managePermissions")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={
                          builtin ? t("protectedActionDisabled") : undefined
                        }
                        disabled={builtin}
                        onClick={() => handleDelete(role)}
                      >
                        <Trash2 />
                        {t("delete")}
                      </Button>
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              );
            })}
            {roles.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  {t("noRoles")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showCreate && (
        <RoleDialog
          appId={appId}
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editRole && (
        <RoleDialog
          appId={appId}
          role={editRole}
          open={!!editRole}
          onOpenChange={(open) => !open && setEditRole(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      <Sheet open={permissionDrawerOpen} onOpenChange={setPermissionDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full data-[side=right]:sm:max-w-2xl data-[side=right]:md:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>
              {selectedRole
                ? rolePermissionsT("assignForRole", { name: selectedRole.name })
                : rolePermissionsT("title")}
            </SheetTitle>
            <SheetDescription>
              {rolePermissionsT("description")}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {selectedRole && (
              <RolePermissionAssignment
                appId={appId}
                roleId={selectedRole.id}
                onSaved={() => setPermissionDrawerOpen(false)}
              />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
