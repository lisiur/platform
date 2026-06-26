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
  Textarea,
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

const positionFormSchema = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

type PositionFormData = z.infer<typeof positionFormSchema>;

interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  position?: {
    id: string;
    name: string;
    code: string;
    description: string | null;
  };
}

export function PositionDialog({
  open,
  onOpenChange,
  orgId,
  position,
}: PositionDialogProps) {
  const t = useTranslations("Positions");
  const queryClient = useQueryClient();
  const isEdit = !!position;

  const form = useForm<PositionFormData>({
    resolver: zodResolver(positionFormSchema),
    defaultValues: {
      name: position?.name ?? "",
      code: position?.code ?? "",
      description: position?.description ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PositionFormData) => {
      if (isEdit) {
        await withApiFeedback(
          appClient.api.organizations[":orgId"].positions[":id"].$put,
        )({
          param: { orgId, id: position.id },
          json: data,
        });
      } else {
        await withApiFeedback(
          appClient.api.organizations[":orgId"].positions.$post,
        )({
          param: { orgId },
          json: data,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions", orgId] });
      toast.success(isEdit ? t("updateSuccess") : t("createSuccess"));
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
          <DialogTitle>
            {isEdit ? t("editPosition") : t("createPosition")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="position-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="pos-name">{t("name")}</FieldLabel>
                <Input
                  id="pos-name"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                  placeholder="Software Engineer"
                />
                <FieldError
                  errors={
                    form.formState.errors.name
                      ? [form.formState.errors.name]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.code}>
                <FieldLabel htmlFor="pos-code">{t("code")}</FieldLabel>
                <Input
                  id="pos-code"
                  aria-invalid={!!form.formState.errors.code}
                  {...form.register("code")}
                  placeholder="software-engineer"
                />
                <FieldError
                  errors={
                    form.formState.errors.code
                      ? [form.formState.errors.code]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pos-description">
                  {t("description")}
                </FieldLabel>
                <Textarea
                  id="pos-description"
                  {...form.register("description")}
                  placeholder={t("descriptionPlaceholder")}
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
            form="position-dialog-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? t("saving")
              : isEdit
                ? t("save")
                : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
