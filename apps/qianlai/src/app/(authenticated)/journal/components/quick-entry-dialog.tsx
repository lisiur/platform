"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  DEFAULT_CREDIT_ACCOUNT_FLAG,
  DEFAULT_DEBIT_ACCOUNT_FLAG,
  hasAccountFlag,
} from "@repo/shared";
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";
import type { AccountRow } from "../../accounts/components/accounts-table";

type QuickKind = "expense" | "income" | "transfer";

/**
 * One-click income/expense/transfer entry: the user picks a scenario and two
 * accounts plus a single amount, and this dialog expands it into the balanced
 * two-line double entry the API expects.
 */
const quickEntrySchema = z
  .object({
    kind: z.enum(["expense", "income", "transfer"]),
    date: z.string().min(1),
    amount: z.number(),
    debitAccount: z.string(),
    creditAccount: z.string(),
    memo: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!(data.amount > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "amountRequired",
      });
    }
    if (!data.debitAccount || !data.creditAccount) {
      ctx.addIssue({
        code: "custom",
        path: ["debitAccount"],
        message: "accountRequired",
      });
    }
    if (
      data.kind === "transfer" &&
      data.debitAccount &&
      data.creditAccount &&
      data.debitAccount === data.creditAccount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["creditAccount"],
        message: "sameAccount",
      });
    }
  });

type QuickEntryFormData = z.infer<typeof quickEntrySchema>;

interface QuickEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
}

export function QuickEntryDialog({
  open,
  onOpenChange,
  ledgerId,
}: QuickEntryDialogProps) {
  const t = useTranslations("Journal");
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery({
    queryKey: ["qianlai", "accounts", ledgerId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$get,
      )({ param: { ledgerId } });
      return (await res.json()) as { accounts: AccountRow[] };
    },
    enabled: open && !!ledgerId,
  });

  const activeAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.status === "active",
  );
  // Asset + liability accounts are the "money pockets": where funds sit or
  // where spending is charged (credit card).
  const assetLikeAccounts = activeAccounts.filter(
    (a) => a.type === "asset" || a.type === "liability",
  );
  // Ledger-flagged default pocket (created with the ledger): prefills the
  // asset-side field so Paid From / Received Into can be left untouched.
  const defaultAccount = activeAccounts.find(
    (a) =>
      hasAccountFlag(a.flags, DEFAULT_DEBIT_ACCOUNT_FLAG) ||
      hasAccountFlag(a.flags, DEFAULT_CREDIT_ACCOUNT_FLAG),
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const defaultValues: QuickEntryFormData = {
    kind: "expense",
    date: today,
    amount: 0,
    debitAccount: "",
    creditAccount: "",
    memo: "",
  };

  const form = useForm<QuickEntryFormData>({
    resolver: zodResolver(quickEntrySchema),
    defaultValues,
  });

  // Fill the asset-side select once the accounts load (or the dialog
  // reopens after a reset); category picks stay the user's job. Transfers
  // only prefill "From" — both sides can't share the default account.
  useEffect(() => {
    if (!open) return;
    const kind = form.getValues("kind");
    if (
      !form.getValues("debitAccount") &&
      kind === "income" &&
      defaultAccount
    ) {
      form.setValue("debitAccount", defaultAccount.id);
    }
    if (
      !form.getValues("creditAccount") &&
      (kind === "expense" || kind === "transfer") &&
      defaultAccount
    ) {
      form.setValue("creditAccount", defaultAccount.id);
    }
  }, [open, form, defaultAccount]);

  const kind = form.watch("kind");
  const debitAccount = form.watch("debitAccount");
  const creditAccount = form.watch("creditAccount");

  // Debit side = where value goes (expense category / receiving pocket /
  // transfer destination); credit side = where it comes from (paying pocket /
  // income source / transfer origin).
  const kindLabels: Record<QuickKind, { debit: string; credit: string }> = {
    expense: {
      debit: t("quick.expenseCategory"),
      credit: t("quick.payAccount"),
    },
    income: {
      debit: t("quick.receiveAccount"),
      credit: t("quick.incomeCategory"),
    },
    transfer: { debit: t("quick.toAccount"), credit: t("quick.fromAccount") },
  };
  const labels = kindLabels[kind];

  const debitOptions =
    kind === "expense"
      ? activeAccounts.filter((a) => a.type === "expense")
      : kind === "income"
        ? activeAccounts.filter((a) => a.type === "asset")
        : assetLikeAccounts;
  const creditOptions =
    kind === "expense"
      ? assetLikeAccounts
      : kind === "income"
        ? activeAccounts.filter((a) => a.type === "income")
        : assetLikeAccounts;

  const validationMessages: Record<string, string> = {
    amountRequired: t("quick.validation.amountRequired"),
    accountRequired: t("quick.validation.accountRequired"),
    sameAccount: t("quick.validation.sameAccount"),
  };
  function translateError(error: { message?: string } | undefined) {
    if (!error?.message) return undefined;
    return { message: validationMessages[error.message] ?? error.message };
  }

  const sameAccount =
    kind === "transfer" && !!debitAccount && debitAccount === creditAccount;

  const amountError = translateError(form.formState.errors.amount);
  const debitAccountError = translateError(form.formState.errors.debitAccount);
  const creditAccountError = translateError(
    form.formState.errors.creditAccount,
  );

  const mutation = useMutation({
    mutationFn: async (data: QuickEntryFormData) => {
      const amount = Number(data.amount);
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].entries.$post,
      )({
        param: { ledgerId },
        json: {
          date: data.date,
          memo: data.memo || undefined,
          lines: [
            { accountId: data.debitAccount, debit: amount, credit: 0 },
            { accountId: data.creditAccount, debit: 0, credit: amount },
          ],
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "entries", ledgerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "dashboard", ledgerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "trial-balance", ledgerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "income-statement", ledgerId],
      });
      toast.success(t("createSuccess"));
      onOpenChange(false);
      form.reset(defaultValues);
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset(defaultValues);
    }
    onOpenChange(nextOpen);
  }

  function handleKindChange(value: QuickKind) {
    // Options differ per kind, so category selections don't carry over — but
    // the ledger's default pocket refills the asset-side field. Transfers
    // only prefill "From" so the two sides can't collide on one account.
    form.setValue("kind", value);
    form.setValue(
      "debitAccount",
      value === "income" ? (defaultAccount?.id ?? "") : "",
    );
    form.setValue(
      "creditAccount",
      value === "expense" || value === "transfer"
        ? (defaultAccount?.id ?? "")
        : "",
    );
    form.clearErrors(["debitAccount", "creditAccount"]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("quickCreate")}</DialogTitle>
          <DialogDescription>{t("quickCreateDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="quick-entry-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <Tabs value={kind} onValueChange={handleKindChange}>
              <TabsList className="w-full">
                <TabsTrigger value="expense">{t("quick.expense")}</TabsTrigger>
                <TabsTrigger value="income">{t("quick.income")}</TabsTrigger>
                <TabsTrigger value="transfer">
                  {t("quick.transfer")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <FieldGroup>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.amount}>
                  <FieldLabel htmlFor="quick-amount" required>
                    {t("quick.amount")}
                  </FieldLabel>
                  <Input
                    id="quick-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    aria-invalid={!!form.formState.errors.amount}
                    {...form.register("amount", { valueAsNumber: true })}
                  />
                  <FieldError
                    errors={amountError ? [amountError] : undefined}
                  />
                </Field>
                <Field data-invalid={!!form.formState.errors.date}>
                  <FieldLabel htmlFor="quick-date" required>
                    {t("dateLabel")}
                  </FieldLabel>
                  <Input
                    id="quick-date"
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
              </div>

              <Field data-invalid={!!form.formState.errors.debitAccount}>
                <FieldLabel htmlFor="quick-debit-account" required>
                  {labels.debit}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="debitAccount"
                  render={({ field, fieldState }) => (
                    <Select
                      value={field.value || null}
                      onValueChange={field.onChange}
                      items={debitOptions.map((account) => ({
                        value: account.id,
                        label: account.name,
                      }))}
                    >
                      <SelectTrigger
                        id="quick-debit-account"
                        aria-invalid={!!fieldState.error}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {debitOptions.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError
                  errors={debitAccountError ? [debitAccountError] : undefined}
                />
              </Field>

              <Field data-invalid={!!form.formState.errors.creditAccount}>
                <FieldLabel htmlFor="quick-credit-account" required>
                  {labels.credit}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="creditAccount"
                  render={({ field, fieldState }) => (
                    <Select
                      value={field.value || null}
                      onValueChange={field.onChange}
                      items={creditOptions.map((account) => ({
                        value: account.id,
                        label: account.name,
                      }))}
                    >
                      <SelectTrigger
                        id="quick-credit-account"
                        aria-invalid={!!fieldState.error}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {creditOptions.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError
                  errors={creditAccountError ? [creditAccountError] : undefined}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="quick-memo">{t("memo")}</FieldLabel>
                <Input
                  id="quick-memo"
                  {...form.register("memo")}
                  placeholder={t("memoPlaceholder")}
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
            form="quick-entry-form"
            disabled={mutation.isPending || sameAccount}
          >
            {mutation.isPending ? t("posting") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
