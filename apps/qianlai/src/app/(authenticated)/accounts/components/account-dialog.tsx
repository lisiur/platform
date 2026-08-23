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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";
import type { AccountRow } from "./accounts-table";

const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

const accountFormSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
});

type AccountFormData = z.infer<typeof accountFormSchema>;

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  account?: AccountRow;
}

export function AccountDialog({
  open,
  onOpenChange,
  ledgerId,
  account,
}: AccountDialogProps) {
  const t = useTranslations("Accounts");
  const queryClient = useQueryClient();
  const isEdit = !!account;

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      code: account?.code ?? "",
      name: account?.name ?? "",
      type: account?.type ?? "asset",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      if (isEdit) {
        await withApiFeedback(
          appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].$patch,
        )({
          param: { ledgerId, id: account.id },
          json: data,
        });
      } else {
        await withApiFeedback(
          appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$post,
        )({ param: { ledgerId }, json: { ...data, parentId: null } });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "accounts", ledgerId],
      });
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
            id="account-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.code}>
                <FieldLabel htmlFor="account-code" required>
                  {t("code")}
                </FieldLabel>
                <Input
                  id="account-code"
                  aria-invalid={!!form.formState.errors.code}
                  {...form.register("code")}
                  placeholder={t("codePlaceholder")}
                />
                <FieldError
                  errors={
                    form.formState.errors.code
                      ? [form.formState.errors.code]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="account-name" required>
                  {t("name")}
                </FieldLabel>
                <Input
                  id="account-name"
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
              <Field data-invalid={!!form.formState.errors.type}>
                <FieldLabel htmlFor="account-type" required>
                  {t("type")}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field, fieldState }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="account-type"
                        aria-invalid={!!fieldState.error}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`types.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError
                  errors={
                    form.formState.errors.type
                      ? [form.formState.errors.type]
                      : undefined
                  }
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
            form="account-dialog-form"
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
