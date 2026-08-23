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
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { QianlaiLedger } from "@/hooks/use-ledgers";
import { appClient, withApiFeedback } from "@/lib/api";

const ledgerFormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

type LedgerFormData = z.infer<typeof ledgerFormSchema>;

interface LedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger?: QianlaiLedger;
}

export function LedgerDialog({
  open,
  onOpenChange,
  ledger,
}: LedgerDialogProps) {
  const t = useTranslations("Ledgers");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const isEdit = !!ledger;

  const form = useForm<LedgerFormData>({
    resolver: zodResolver(ledgerFormSchema),
    defaultValues: {
      name: ledger?.name ?? "",
      description: ledger?.description ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: LedgerFormData) => {
      if (isEdit) {
        await withApiFeedback(appClient.api.bookkeeping.ledgers[":id"].$patch)({
          param: { id: ledger.id },
          json: { name: data.name, description: data.description ?? null },
        });
      } else {
        await withApiFeedback(appClient.api.bookkeeping.ledgers.$post)({
          json: {
            name: data.name,
            description: data.description || undefined,
            locale: locale.startsWith("zh") ? "zh" : "en",
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qianlai", "ledgers"] });
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
          <DialogTitle>{isEdit ? t("edit") : t("create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="ledger-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="ledger-name" required>
                  {t("name")}
                </FieldLabel>
                <Input
                  id="ledger-name"
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
                <FieldLabel htmlFor="ledger-description">
                  {t("description_label")}
                </FieldLabel>
                <Textarea
                  id="ledger-description"
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
            form="ledger-dialog-form"
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
