"use client";

import type { FetchPageParams } from "@repo/frontend";
import { PermissionSelector } from "@repo/frontend";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";

interface PositionPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  positionId: string;
  positionName: string;
}

export function PositionPermissionsDialog({
  open,
  onOpenChange,
  orgId,
  positionId,
  positionName,
}: PositionPermissionsDialogProps) {
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

  const mutation = useMutation({
    mutationFn: async (permissionIds: string[]) => {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].positions[":id"].permissions.$put,
      )({
        param: { orgId, id: positionId },
        json: { permissionIds },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["position-permissions", orgId, positionId],
      });
      toast.success(t("permissionsUpdated"));
      onOpenChange(false);
      setSelectedIds(null);
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedIds(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("managePermissions")}</DialogTitle>
          <DialogDescription>
            {t("managePermissionsDescription", { name: positionName })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <PermissionSelector
              fetchPage={fetchPage}
              value={currentIds}
              onChange={setSelectedIds}
              selectedItems={data ?? []}
              height={400}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate(currentIds)}
            disabled={mutation.isPending || isLoading}
          >
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
