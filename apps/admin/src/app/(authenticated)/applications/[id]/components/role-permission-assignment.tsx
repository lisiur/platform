"use client";

import type { FetchPageParams, PermissionItem } from "@repo/frontend";
import { PermissionSelector } from "@repo/frontend";
import { Button, Skeleton } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

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
  const [selectedItems, setSelectedItems] = useState<PermissionItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const skeletonIds = useRef(
    Array.from({ length: 5 }, () => crypto.randomUUID()),
  );

  const fetchAssignment = useCallback(async () => {
    setLoading(true);
    try {
      const roleRes = await withApiFeedback(
        appClient.api["role-permissions"][":roleId"].$get,
      )({
        param: { roleId },
      });

      const roleData = await roleRes.json();
      setSelectedItems(roleData.permissions);
      setSelectedIds(roleData.permissions.map((p: { id: string }) => p.id));
    } catch {
      setSelectedItems([]);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const fetchPage = useCallback(
    async (params: FetchPageParams) => {
      const res = await appClient.api.permissions.$get({
        query: {
          appId,
          search: params.search || undefined,
          sort: params.sort ?? undefined,
          sortDir: params.sortDir,
          limit: params.limit,
          offset: params.offset,
        },
      });
      const data = await res.json();
      return { permissions: data.permissions, total: data.total };
    },
    [appId],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await withApiFeedback(appClient.api["role-permissions"].batch.$put)({
        json: { roleId, permissionIds: selectedIds },
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
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="space-y-2">
            {skeletonIds.current.map((id) => (
              <Skeleton key={id} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <PermissionSelector
            fetchPage={fetchPage}
            value={selectedIds}
            onChange={setSelectedIds}
            selectedItems={selectedItems}
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
