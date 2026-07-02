"use client";

import type { FetchPageParams } from "@repo/frontend";
import { PermissionSelector } from "@repo/frontend";
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";

interface PositionPermissionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  positionId: string;
  positionName: string;
}

export function PositionPermissionsSheet({
  open,
  onOpenChange,
  orgId,
  positionId,
  positionName,
}: PositionPermissionsSheetProps) {
  const t = useTranslations("Positions");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["position-permissions", orgId, positionId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].positions[":id"].permissions.$get,
      )({
        param: { orgId, id: positionId },
      });
      const json = await res.json();
      return json.assigned;
    },
    enabled: open,
  });

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const skeletonIds = useRef(
    Array.from({ length: 5 }, () => crypto.randomUUID()),
  );

  const currentIds = selectedIds ?? data?.map((p) => p.id) ?? [];

  const fetchPage = useCallback(
    async (params: FetchPageParams) => {
      const res = await appClient.api.organizations[":orgId"].positions[":id"][
        "available-permissions"
      ].$get({
        param: { orgId, id: positionId },
        query: {
          search: params.search || undefined,
          sort: params.sort ?? undefined,
          sortDir: params.sortDir,
          limit: params.limit,
          offset: params.offset,
        },
      });
      const json = await res.json();
      return { permissions: json.permissions, total: json.total };
    },
    [orgId, positionId],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].positions[":id"].permissions.$put,
      )({
        param: { orgId, id: positionId },
        json: { permissionIds: currentIds },
      });
      queryClient.invalidateQueries({ queryKey: ["positions", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["position-permissions", orgId, positionId],
      });
      toast.success(t("permissionsUpdated"));
      onOpenChange(false);
      setSelectedIds(null);
    } catch {
      // Error handled by withApiFeedback.
    } finally {
      setSaving(false);
    }
  }, [currentIds, onOpenChange, orgId, positionId, queryClient, t]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full data-[side=right]:sm:max-w-5xl"
      >
        <SheetHeader>
          <SheetTitle>{t("managePermissions")}</SheetTitle>
          <SheetDescription>
            {t("managePermissionsDescription", { name: positionName })}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex min-h-0 flex-1 flex-col">
            {isLoading ? (
              <div className="space-y-2">
                {skeletonIds.current.map((id) => (
                  <Skeleton key={id} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="min-h-0 flex-1">
                <PermissionSelector
                  fetchPage={fetchPage}
                  value={currentIds}
                  onChange={setSelectedIds}
                  selectedItems={data ?? []}
                />
              </div>
            )}
            <div className="mt-4 flex shrink-0 justify-end border-t pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="mr-2"
              >
                {t("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving || isLoading}>
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
