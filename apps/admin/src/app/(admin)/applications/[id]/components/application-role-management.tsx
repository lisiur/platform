"use client";

import { isBuiltinRole } from "@repo/shared";
import { ListChecks, ShieldUser } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { withApiFeedback } from "@/lib/api/utils";
import { cn } from "@/utils/cn";
import { RoleMenuAssignment } from "./role-menu-assignment";

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
  const roleMenusT = useTranslations("RoleMenus");
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
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
                  size="icon"
                  onClick={() => {
                    setSelectedRole(role);
                    setMenuDrawerOpen(true);
                  }}
                >
                  <ListChecks className="h-4 w-4" />
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

      <Sheet open={menuDrawerOpen} onOpenChange={setMenuDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {selectedRole
                ? roleMenusT("assignForRole", { name: selectedRole.name })
                : roleMenusT("title")}
            </SheetTitle>
            <SheetDescription>{roleMenusT("description")}</SheetDescription>
          </SheetHeader>
          <RoleMenuAssignment
            appId={appId}
            role={selectedRole}
            onSaved={() => setMenuDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
