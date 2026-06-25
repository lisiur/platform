"use client";

import { Button, Checkbox, Skeleton } from "@repo/ui";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface Permission {
  id: string;
  code: string;
  name: string;
  group: string;
}

interface RolePermissionAssignmentProps {
  appId: string;
  roleId: string;
  onSaved?: () => void;
}

export function RolePermissionAssignment({
  appId,
  roleId,
  onSaved,
}: RolePermissionAssignmentProps) {
  const t = useTranslations("RolePermissions");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const skeletonIds = useRef(
    Array.from({ length: 5 }, () => crypto.randomUUID()),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions) {
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const fetchAssignment = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, roleRes] = await Promise.all([
        withApiFeedback(appClient.api.permissions.$get)({ query: { appId } }),
        withApiFeedback(appClient.api["role-permissions"][":roleId"].$get)({
          param: { roleId },
        }),
      ]);

      const allData = await allRes.json();
      const roleData = await roleRes.json();
      setPermissions(allData.permissions);
      setSelectedIds(new Set(roleData.permissions.map((p) => p.id)));
    } catch {
      setPermissions([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [appId, roleId]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  const togglePermission = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleGroupAll = useCallback(
    (items: Permission[], checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of items) {
          if (checked) {
            next.add(item.id);
          } else {
            next.delete(item.id);
          }
        }
        return next;
      });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await withApiFeedback(appClient.api["role-permissions"].batch.$put)({
        json: { roleId, permissionIds: Array.from(selectedIds) },
      });
      toast.success(t("saved"));
      onSaved?.();
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }, [roleId, selectedIds, t, onSaved]);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div className="min-h-0 flex-1 overflow-auto rounded-md border p-1">
        {loading ? (
          <div className="space-y-2">
            {skeletonIds.current.map((id) => (
              <Skeleton key={id} className="h-8 w-full" />
            ))}
          </div>
        ) : permissions.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {t("noPermissions")}
          </div>
        ) : (
          <div className="p-1">
            {grouped.map(([group, items]) => {
              const checkedCount = items.filter((i) =>
                selectedIds.has(i.id),
              ).length;
              const allChecked = checkedCount === items.length;
              const someChecked = checkedCount > 0 && !allChecked;
              const isCollapsed = collapsedGroups.has(group);
              return (
                <div key={group} className="mb-1">
                  <div className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onCheckedChange={(checked) =>
                        toggleGroupAll(items, !!checked)
                      }
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-sm text-inherit"
                      onClick={() => toggleGroup(group)}
                      aria-expanded={!isCollapsed}
                    >
                      <span className="truncate font-medium">{group}</span>
                      <span className="text-xs text-muted-foreground">
                        ({checkedCount}/{items.length})
                      </span>
                      <ChevronRight
                        className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      />
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div>
                      {items.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 pl-9 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={(checked) =>
                              togglePermission(item.id, !!checked)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                          </span>
                          <code className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {item.code}
                          </code>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
