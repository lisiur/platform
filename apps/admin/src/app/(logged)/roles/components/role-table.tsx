"use client";

import { ListChecks, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";

interface Role {
  id: string;
  appId: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

interface Application {
  id: string;
  name: string;
  code: string;
}

export function RoleTable() {
  const t = useTranslations("Roles");
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      const res = await apiWithFeedback(appClient.api.applications.$get)({
        query: { limit: 100, offset: 0 },
      });
      const data = await res.json();
      setApplications(data.applications ?? []);
    } catch {
      toast.error(t("loadError"));
    }
  }, [t]);

  const fetchRoles = useCallback(
    async (appId: string) => {
      setLoading(true);
      try {
        const res = await apiWithFeedback(appClient.api.roles.$get)({
          query: { appId },
        });
        const data = await res.json();
        setRoles(data);
      } catch {
        toast.error(t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (selectedApp) {
      fetchRoles(selectedApp.id);
    }
  }, [selectedApp, fetchRoles]);

  async function handleDelete(role: Role) {
    try {
      await apiWithFeedback(appClient.api.roles[":id"].$delete)({
        param: { id: role.id },
      });
      toast.success(t("deleteSuccess"));
      if (selectedApp) fetchRoles(selectedApp.id);
    } catch {
      toast.error(t("deleteError"));
    }
  }

  return (
    <div className="flex gap-6">
      <div className="w-48 shrink-0">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">
          {t("applications")}
        </h3>
        <div className="space-y-0.5">
          {applications.map((app) => (
            <button
              key={app.id}
              type="button"
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                selectedApp?.id === app.id ? "bg-accent font-medium" : ""
              }`}
              onClick={() => setSelectedApp(app)}
            >
              {app.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {selectedApp ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {selectedApp.name} — {t("title")}
              </h2>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("code")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{role.code}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          render={<Link href={`/roles/${role.id}/menus`} />}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(role)}
                        >
                          <Trash2 className="h-4 w-4" />
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
            )}
          </>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">{t("selectApp")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
