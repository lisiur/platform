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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";
import { endOfUtcDay } from "@/utils/date";
import type { AccountRow } from "./accounts-table";

/**
 * Sets an account's balance as of a date. The backend posts a balanced
 * adjustment entry against the system equity account; entries dated after
 * `date` are untouched, so the current balance shifts by the same delta.
 */
export function BalanceDialog({
  open,
  onOpenChange,
  ledgerId,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  account: AccountRow;
}) {
  const t = useTranslations("Accounts.balance");

  const balanceFormSchema = z.object({
    balance: z.number().min(0, t("validation.balanceMin")),
    date: z.string().min(1, t("validation.dateRequired")),
    memo: z.string().optional(),
  });

  type BalanceFormData = z.infer<typeof balanceFormSchema>;

  const queryClient = useQueryClient();

  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date());

  const form = useForm<BalanceFormData>({
    resolver: zodResolver(balanceFormSchema),
    defaultValues: { balance: 0, date: today, memo: "" },
  });

  // The backend computes the adjustment against the balance as of this date,
  // so the displayed balance must come from the same window — not the
  // all-time trial balance.
  const selectedDate = form.watch("date");

  const { data: trialBalance } = useQuery({
    queryKey: ["qianlai", "trial-balance", ledgerId, selectedDate],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].reports["trial-balance"]
          .$get,
      )({
        param: { ledgerId },
        query: { to: endOfUtcDay(selectedDate).toISOString() },
      });
      return (await res.json()) as {
        accounts: Array<{ id: string; balance: number }>;
      };
    },
    enabled: open && !!ledgerId && !!selectedDate,
    placeholderData: (previous) => previous,
  });
  const currentBalance = trialBalance?.accounts.find(
    (row) => row.id === account.id,
  )?.balance;

  const mutation = useMutation({
    mutationFn: async (data: BalanceFormData) => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].balance
          .$post,
      )({
        param: { ledgerId, id: account.id },
        json: {
          balance: data.balance,
          date: data.date,
          memo: data.memo || undefined,
        },
      });
      return (await res.json()) as { adjusted: boolean };
    },
    onSuccess: (result) => {
      for (const key of [
        "accounts",
        "entries",
        "dashboard",
        "trial-balance",
        "income-statement",
      ]) {
        queryClient.invalidateQueries({ queryKey: ["qianlai", key, ledgerId] });
      }
      toast.success(result.adjusted ? t("success") : t("alreadyAtBalance"));
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
          <DialogTitle>{t("title", { name: account.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="balance-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.balance}>
                <FieldLabel htmlFor="account-balance" required>
                  {t("balanceLabel")}
                </FieldLabel>
                <Input
                  id="account-balance"
                  type="number"
                  step="0.01"
                  min="0"
                  aria-invalid={!!form.formState.errors.balance}
                  {...form.register("balance", { valueAsNumber: true })}
                />
                <FieldError
                  errors={
                    form.formState.errors.balance
                      ? [form.formState.errors.balance]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.date}>
                <FieldLabel htmlFor="account-balance-date" required>
                  {t("dateLabel")}
                </FieldLabel>
                <Input
                  id="account-balance-date"
                  type="date"
                  aria-invalid={!!form.formState.errors.date}
                  {...form.register("date")}
                />
                <FieldError
                  errors={
                    form.formState.errors.date
                      ? [form.formState.errors.date]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-balance-memo">
                  {t("memoLabel")}
                </FieldLabel>
                <Input
                  id="account-balance-memo"
                  {...form.register("memo")}
                  placeholder={t("memoPlaceholder")}
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                {t("balanceAsOf", { date: selectedDate || today })}
                {currentBalance === undefined
                  ? "…"
                  : ` ${currentBalance.toLocaleString()}`}
                {account.type === "liability" ? ` — ${t("liabilityHint")}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">{t("asOfHint")}</p>
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
            form="balance-dialog-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
