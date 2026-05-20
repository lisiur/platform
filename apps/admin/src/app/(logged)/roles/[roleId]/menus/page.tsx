"use client";

import { ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appClient } from "@/lib/api";
import type { Menu } from "@/lib/api/menu";
import { cn } from "@/utils/cn";
import { RoleMenuTree } from "./components/role-menu-tree";

interface Application {
  id: string;
  name: string;
  code: string;
}

const roleNames: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  user: "User",
};

interface RoleMenusPageProps {
  params: Promise<{ roleId: string }>;
}

export default function RoleMenusPage({ params }: RoleMenusPageProps) {
  const t = useTranslations("RoleMenus");
  const { roleId } = use(params);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [appMenus, setAppMenus] = useState<Menu[]>([]);
  const [assignedMenuIds, setAssignedMenuIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      const res = await appClient.api.applications.$get();
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications ?? []);
      }
    } catch {
      toast.error(t("loadError"));
    }
  }, [t]);

  const fetchAppMenus = useCallback(
    async (appId: string) => {
      setLoading(true);
      try {
        const res = await appClient.api.menu.$get({
          query: { appId },
        });
        if (res.ok) {
          const data = await res.json();
          setAppMenus(data.menus);
        }
      } catch {
        toast.error(t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const fetchRoleMenus = useCallback(async () => {
    try {
      const res = await appClient.api["menu-role"][":roleId"].$get({
        param: { roleId },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignedMenuIds(new Set(data.menus.map((m: Menu) => m.id)));
      }
    } catch {
      toast.error(t("loadError"));
    }
  }, [roleId, t]);

  useEffect(() => {
    fetchApplications();
    fetchRoleMenus();
  }, [fetchApplications, fetchRoleMenus]);

  useEffect(() => {
    if (selectedApp) {
      fetchAppMenus(selectedApp.id);
    }
  }, [selectedApp, fetchAppMenus]);

  const handleSave = useCallback(async () => {
    if (!selectedApp) return;
    setSaving(true);
    try {
      const res = await appClient.api["menu-role"].batch.$put({
        json: {
          roleId,
          menuIds: Array.from(assignedMenuIds),
        },
      });
      if (res.ok) {
        toast.success(t("saved"));
      } else {
        toast.error(t("saveError"));
      }
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [roleId, selectedApp, assignedMenuIds, t]);

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <Link
          href="/roles"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToRoles")}
        </Link>
        <h1 className="text-2xl font-bold">
          {t("title")} — {roleNames[roleId] ?? roleId}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex gap-6" style={{ height: "calc(100vh - 200px)" }}>
        {/* Left panel — Application list */}
        <div className="w-60 shrink-0 overflow-auto rounded-md border">
          <div className="p-2">
            <h3 className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase">
              {t("selectApp")}
            </h3>
            {applications.length === 0 ? (
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {applications.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      selectedApp?.id === app.id &&
                        "bg-accent font-medium text-accent-foreground",
                    )}
                    onClick={() => setSelectedApp(app)}
                  >
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{app.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — Menu tree with checkboxes */}
        <div className="flex-1 overflow-auto">
          {!selectedApp ? (
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
              <p className="text-sm text-muted-foreground">
                {t("noAppSelected")}
              </p>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <RoleMenuTree
                menus={appMenus}
                checkedIds={assignedMenuIds}
                onCheckedChange={setAssignedMenuIds}
              />
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
