"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface MemberDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  memberId: string;
  memberName: string;
  currentDepartmentId: string | null;
}

const NO_DEPARTMENT = "";

export function MemberDepartmentDialog({
  open,
  onOpenChange,
  orgId,
  memberId,
  memberName,
  currentDepartmentId,
}: MemberDepartmentDialogProps) {
  const t = useTranslations("Members");
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>(
    currentDepartmentId ?? NO_DEPARTMENT,
  );

  const { data: allDepartments, isLoading } = useQuery({
    queryKey: ["departments", orgId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].departments.$get,
      )({ param: { orgId } });
      const data = await res.json();
      return data.departments as Department[];
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const departmentId = selectedId === NO_DEPARTMENT ? null : selectedId;
      await withApiFeedback(
        appClient.api.organizations[":orgId"].members[":memberId"].$patch,
      )({
        param: { orgId, memberId },
        json: { departmentId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
      toast.success(t("departmentUpdated"));
      onOpenChange(false);
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedId(currentDepartmentId ?? NO_DEPARTMENT);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("manageDepartment")}</DialogTitle>
          <DialogDescription>
            {t("manageDepartmentDescription", { name: memberName })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Spinner />
            </div>
          ) : allDepartments?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {t("noDepartmentsAvailable")}
            </div>
          ) : (
            <RadioGroup
              value={selectedId}
              onValueChange={(value) => setSelectedId(value as string)}
              className="rounded-md border divide-y overflow-hidden"
            >
              <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value={NO_DEPARTMENT} />
                <div className="flex-1">
                  <div className="font-medium text-muted-foreground">
                    {t("noDepartment")}
                  </div>
                </div>
              </label>
              {allDepartments?.map((department) => (
                <label
                  key={department.id}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                >
                  <RadioGroupItem value={department.id} />
                  <div className="flex-1">
                    <div className="font-medium">{department.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {department.code}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
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
