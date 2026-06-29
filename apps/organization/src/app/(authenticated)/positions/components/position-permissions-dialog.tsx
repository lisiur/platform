"use client";

import {
  Button,
  Checkbox,
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
import { useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";

interface PermissionItem {
  id: string;
  code: string;
  name: string;
  group: string;
  description: string | null;
}

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
      return json as {
        assigned: PermissionItem[];
        available: PermissionItem[];
      };
    },
    enabled: open,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  const currentIds =
    selectedIds ?? new Set(data?.assigned.map((p) => p.id) ?? []);

  function handleToggle(permissionId: string) {
    setSelectedIds((prev) => {
      const base = prev ?? new Set(data?.assigned.map((p) => p.id) ?? []);
      const next = new Set(base);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  }

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

  const grouped = (data?.available ?? []).reduce(
    (acc, perm) => {
      if (!acc[perm.group]) acc[perm.group] = [];
      acc[perm.group].push(perm);
      return acc;
    },
    {} as Record<string, PermissionItem[]>,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
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
          ) : (data?.available ?? []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("noPermissionsAvailable")}
            </div>
          ) : (
            <div className="max-h-[400px] space-y-4 overflow-y-auto">
              {Object.entries(grouped).map(([group, perms]) => (
                <div key={group}>
                  <h4 className="mb-2 text-sm font-semibold capitalize">
                    {group}
                  </h4>
                  <div className="space-y-1">
                    {perms.map((perm) => (
                      <label
                        key={perm.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={currentIds.has(perm.id)}
                          onCheckedChange={() => handleToggle(perm.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{perm.name}</div>
                          {perm.description && (
                            <div className="text-muted-foreground text-xs">
                              {perm.description}
                            </div>
                          )}
                          <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">
                            {perm.code}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate(Array.from(currentIds))}
            disabled={mutation.isPending || isLoading}
          >
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
