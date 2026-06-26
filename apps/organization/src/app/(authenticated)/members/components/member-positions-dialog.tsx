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

interface Position {
  id: string;
  name: string;
  code: string;
}

interface MemberPositionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  memberId: string;
  memberName: string;
  currentPositions: Position[];
}

export function MemberPositionsDialog({
  open,
  onOpenChange,
  orgId,
  memberId,
  memberName,
  currentPositions,
}: MemberPositionsDialogProps) {
  const t = useTranslations("Members");
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentPositions.map((p) => p.id)),
  );

  const { data: allPositions, isLoading } = useQuery({
    queryKey: ["positions", orgId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].positions.$get,
      )({ param: { orgId } });
      const data = await res.json();
      return data.positions as Position[];
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].members[":memberId"].positions
          .$put,
      )({
        param: { orgId, memberId },
        json: { positionIds: Array.from(selectedIds) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      toast.success(t("positionsUpdated"));
      onOpenChange(false);
    },
  });

  function handleToggle(positionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(positionId)) {
        next.delete(positionId);
      } else {
        next.add(positionId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (allPositions) {
      setSelectedIds(new Set(allPositions.map((p) => p.id)));
    }
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedIds(new Set(currentPositions.map((p) => p.id)));
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("managePositions")}</DialogTitle>
          <DialogDescription>
            {t("managePositionsDescription", { name: memberName })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Spinner />
            </div>
          ) : allPositions?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {t("noPositionsAvailable")}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  {t("selectAll")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  {t("selectNone")}
                </Button>
              </div>
              <div className="rounded-md border divide-y">
                {allPositions?.map((position) => (
                  <label
                    key={position.id}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedIds.has(position.id)}
                      onCheckedChange={() => handleToggle(position.id)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{position.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {position.code}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("selectedCount", { count: selectedIds.size })}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
