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
import { useLedgerStore } from "@/stores/ledger-store";

const joinFormSchema = z.object({
  code: z.string().min(1),
});

type JoinFormData = z.infer<typeof joinFormSchema>;

interface JoinLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinLedgerDialog({
  open,
  onOpenChange,
}: JoinLedgerDialogProps) {
  const t = useTranslations("Ledgers");
  const queryClient = useQueryClient();
  const setActiveLedger = useLedgerStore((s) => s.setActiveLedger);

  const form = useForm<JoinFormData>({
    resolver: zodResolver(joinFormSchema),
    defaultValues: { code: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: JoinFormData) => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping["share-codes"].redeem.$post,
      )({ json: { code: data.code.trim() } });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["qianlai", "ledgers"] });
      setActiveLedger(data.ledgerId);
      toast.success(t("joinSuccess"));
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
          <DialogTitle>{t("join")}</DialogTitle>
          <DialogDescription>{t("joinDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="join-ledger-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.code}>
                <FieldLabel htmlFor="join-code" required>
                  {t("code")}
                </FieldLabel>
                <Input
                  id="join-code"
                  className="font-mono"
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
            form="join-ledger-form"
            disabled={mutation.isPending}
          >
            {t("join")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
