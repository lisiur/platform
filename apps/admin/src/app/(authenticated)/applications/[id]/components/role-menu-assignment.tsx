"use client";

import { Button, Skeleton } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { RoleMenuTree } from "./role-menu-tree";

interface Role {
  id: string;
  appId: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

interface Menu {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
  url: string | null;
  sortOrder: number;
}

function getLocalSelectedMenuIds(menus: Menu[], persistedIds: Set<string>) {
  const childCountByParentId = new Map<string, number>();

  for (const menu of menus) {
    if (!menu.parentId) continue;
    childCountByParentId.set(
      menu.parentId,
      (childCountByParentId.get(menu.parentId) ?? 0) + 1,
    );
  }

  return new Set(
    menus
      .filter((menu) => persistedIds.has(menu.id))
      .filter((menu) => {
        const hasChildren = (childCountByParentId.get(menu.id) ?? 0) > 0;
        return menu.linkType !== "GROUP" || !hasChildren;
      })
      .map((menu) => menu.id),
  );
}

interface RoleMenuAssignmentProps {
  appId: string;
  role: Role | null;
  onSaved?: () => void;
}

export function RoleMenuAssignment({
  appId,
  role,
  onSaved,
}: RoleMenuAssignmentProps) {
  const t = useTranslations("RoleMenus");
  const [appMenus, setAppMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const skeletonIds = useRef(
    Array.from({ length: 5 }, () => crypto.randomUUID()),
  );

  const fetchAssignment = useCallback(async () => {
    if (!role) return;

    setLoading(true);
    try {
      const [menusRes, roleMenusRes] = await Promise.all([
        withApiFeedback(appClient.api.menus.$get)({
          query: { appId },
        }),
        withApiFeedback(appClient.api["role-menus"][":roleId"].$get)({
          param: { roleId: role.id },
        }),
      ]);

      const menusData = await menusRes.json();
      const roleMenusData = await roleMenusRes.json();
      const menuIds = new Set(menusData.menus.map((menu: Menu) => menu.id));
      const persistedIds = new Set<string>(
        roleMenusData.menus
          .filter((menu: Menu) => menuIds.has(menu.id))
          .map((menu: Menu) => menu.id),
      );

      setAppMenus(menusData.menus);
      setSelectedMenuIds(
        getLocalSelectedMenuIds(menusData.menus, persistedIds),
      );
    } catch {
      setAppMenus([]);
      setSelectedMenuIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [appId, role]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const handleSave = useCallback(async () => {
    if (!role) return;

    setSaving(true);
    try {
      await withApiFeedback(appClient.api["role-menus"].batch.$put)({
        json: {
          roleId: role.id,
          menuIds: Array.from(selectedMenuIds),
        },
      });
      toast.success(t("saved"));
      onSaved?.();
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }, [role, selectedMenuIds, t, onSaved]);

  if (!role) {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("selectRole")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div className="min-h-0 flex-1 overflow-auto rounded-md border p-1">
        {loading ? (
          <div className="space-y-2">
            {skeletonIds.current.map((id) => (
              <Skeleton key={id} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <RoleMenuTree
            menus={appMenus}
            selectedIds={selectedMenuIds}
            onSelectedChange={setSelectedMenuIds}
          />
        )}
      </div>

      <div className="mt-4 flex shrink-0 justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
