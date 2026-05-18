"use client";

import { Eye, Shield, ShieldCheck, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleDetailDialog } from "./role-detail-dialog";

interface RoleInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  permissions: Record<string, string[]>;
}

const roles: RoleInfo[] = [
  {
    id: "admin",
    name: "admin",
    description: "admin_desc",
    icon: <ShieldCheck className="h-4 w-4" />,
    permissions: {
      user: [
        "create",
        "list",
        "set-role",
        "ban",
        "impersonate",
        "delete",
        "set-password",
      ],
      session: ["list", "revoke", "delete"],
      project: ["create", "read", "update", "delete"],
      config: ["read", "update"],
    },
  },
  {
    id: "manager",
    name: "manager",
    description: "manager_desc",
    icon: <Shield className="h-4 w-4" />,
    permissions: {
      user: ["list", "set-role"],
      session: ["list"],
      project: ["create", "read", "update"],
      config: ["read"],
    },
  },
  {
    id: "user",
    name: "user",
    description: "user_desc",
    icon: <User className="h-4 w-4" />,
    permissions: {
      user: [],
      session: [],
      project: ["read"],
      config: ["read"],
    },
  },
];

export function RoleTable() {
  const t = useTranslations("Roles");
  const [selectedRole, setSelectedRole] = useState<RoleInfo | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("description_label")}</TableHead>
            <TableHead>{t("permissions")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {role.icon}
                  <span className="font-medium">{t(role.name)}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t(role.description)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(role.permissions).map(
                    ([resource, actions]) =>
                      actions.length > 0 ? (
                        <Badge
                          key={resource}
                          variant="secondary"
                          className="text-xs"
                        >
                          {resource}: {actions.length}
                        </Badge>
                      ) : null,
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedRole(role)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedRole && (
        <RoleDetailDialog
          role={selectedRole}
          open={!!selectedRole}
          onOpenChange={(open) => !open && setSelectedRole(null)}
        />
      )}
    </>
  );
}
