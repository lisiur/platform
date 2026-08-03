"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

const editMemberSchema = z.object({
  name: z.string().min(1),
  employeeId: z.string(),
});

type EditMemberFormData = z.infer<typeof editMemberSchema>;

interface MemberEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  memberId: string;
  memberName: string;
  memberEmployeeId: string | null;
}

export function MemberEditDialog({
  open,
  onOpenChange,
  orgId,
  memberId,
  memberName,
  memberEmployeeId,
}: MemberEditDialogProps) {
  const t = useTranslations("Members");
  const queryClient = useQueryClient();

  const form = useForm<EditMemberFormData>({
    resolver: zodResolver(editMemberSchema),
    defaultValues: {
      name: memberName,
      employeeId: memberEmployeeId ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: EditMemberFormData) => {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].members[":memberId"].$patch,
      )({
        param: { orgId, memberId },
        json: {
          name: data.name,
          employeeId: data.employeeId || null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organization-members", orgId],
      });
      toast.success(t("updateSuccess"));
      onOpenChange(false);
      form.reset();
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editMember")}</DialogTitle>
          <DialogDescription>{t("editMemberDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="member-edit-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="member-name">{t("name")}</FieldLabel>
                <Input
                  id="member-name"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                  placeholder={t("namePlaceholder")}
                />
                <FieldError
                  errors={
                    form.formState.errors.name
                      ? [form.formState.errors.name]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-employee-id">
                  {t("employeeId")}
                </FieldLabel>
                <Input
                  id="member-employee-id"
                  {...form.register("employeeId")}
                  placeholder={t("employeeIdPlaceholder")}
                />
              </Field>
            </FieldGroup>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="member-edit-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
