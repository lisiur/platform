"use client";

import { isBuiltinRole } from "@repo/shared";
import {
  Badge,
  Button,
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
import { ListChecks, ShieldUser } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
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
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissionDrawerOpen, setPermissionDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Table
        containerClassName={cn(
          "min-h-0 flex-1 overflow-auto rounded-md border",
          className,
        )}
      >
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
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>{role.name}</span>
                  {isBuiltinRole(role.flags) && (
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
              </TableCell>
            </TableRow>
          ))}
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
