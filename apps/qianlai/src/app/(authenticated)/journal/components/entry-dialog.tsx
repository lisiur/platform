"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";
import type { AccountRow } from "../../accounts/components/accounts-table";

const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.number().min(0),
  credit: z.number().min(0),
  memo: z.string().optional(),
});

const entryFormSchema = z
  .object({
    date: z.string().min(1),
    memo: z.string().optional(),
    lines: z.array(lineSchema).min(2),
  })
  .superRefine((data, ctx) => {
    let totalDebit = 0;
    let totalCredit = 0;
    data.lines.forEach((line, index) => {
      const hasDebit = line.debit > 0;
      const hasCredit = line.credit > 0;
      if (hasDebit && hasCredit) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index],
          message: "oneSideOnly",
        });
      } else if (!hasDebit && !hasCredit) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index],
          message: "amountRequired",
        });
      }
      totalDebit += line.debit;
      totalCredit += line.credit;
    });
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "mustBalance" });
    }
  });

type EntryFormData = z.infer<typeof entryFormSchema>;

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
}

export function EntryDialog({
  open,
  onOpenChange,
  ledgerId,
}: EntryDialogProps) {
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

  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const form = useForm<EntryFormData>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: {
      date: today,
      memo: "",
      lines: [
        { accountId: "", debit: 0, credit: 0, memo: "" },
        { accountId: "", debit: 0, credit: 0, memo: "" },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const lines = form.watch("lines");
  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce(
    (acc, l) => acc + (Number(l.credit) || 0),
    0,
  );
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const mutation = useMutation({
    mutationFn: async (data: EntryFormData) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].entries.$post,
      )({
        param: { ledgerId },
        json: {
          date: data.date,
          memo: data.memo || undefined,
          lines: data.lines.map((line) => ({
            accountId: line.accountId,
            debit: Number(line.debit) || 0,
            credit: Number(line.credit) || 0,
            memo: line.memo || undefined,
          })),
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
      form.reset({
        date: today,
        memo: "",
        lines: [
          { accountId: "", debit: 0, credit: 0, memo: "" },
          { accountId: "", debit: 0, credit: 0, memo: "" },
        ],
      });
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset({
        date: today,
        memo: "",
        lines: [
          { accountId: "", debit: 0, credit: 0, memo: "" },
          { accountId: "", debit: 0, credit: 0, memo: "" },
        ],
      });
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("advancedCreate")}</DialogTitle>
          <DialogDescription>
            {t("advancedCreateDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="entry-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.date}>
                  <FieldLabel htmlFor="entry-date" required>
                    {t("dateLabel")}
                  </FieldLabel>
                  <Input
                    id="entry-date"
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
                  <FieldLabel htmlFor="entry-memo">{t("memo")}</FieldLabel>
                  <Input
                    id="entry-memo"
                    {...form.register("memo")}
                    placeholder={t("memoPlaceholder")}
                  />
                </Field>
              </div>
            </FieldGroup>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const lineError = form.formState.errors.lines?.[index];
                return (
                  <div
                    key={field.id}
                    data-invalid={!!lineError}
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_7rem_auto]">
                      <Field
                        data-invalid={!!lineError?.accountId}
                        className="min-w-0"
                      >
                        <FieldLabel htmlFor={`line-account-${index}`} required>
                          {t("account")}
                        </FieldLabel>
                        <Controller
                          control={form.control}
                          name={`lines.${index}.accountId`}
                          render={({ field: ctrl, fieldState }) => (
                            <Select
                              value={ctrl.value || null}
                              onValueChange={ctrl.onChange}
                            >
                              <SelectTrigger
                                id={`line-account-${index}`}
                                aria-invalid={!!fieldState.error}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {activeAccounts.map((account) => (
                                  <SelectItem
                                    key={account.id}
                                    value={account.id}
                                  >
                                    {account.code} · {account.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <FieldError
                          errors={
                            lineError?.accountId
                              ? [lineError.accountId]
                              : undefined
                          }
                        />
                      </Field>
                      <Field data-invalid={!!lineError?.debit}>
                        <FieldLabel htmlFor={`line-debit-${index}`}>
                          {t("debit")}
                        </FieldLabel>
                        <Input
                          id={`line-debit-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          aria-invalid={!!lineError?.debit}
                          {...form.register(`lines.${index}.debit`, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>
                      <Field data-invalid={!!lineError?.credit}>
                        <FieldLabel htmlFor={`line-credit-${index}`}>
                          {t("credit")}
                        </FieldLabel>
                        <Input
                          id={`line-credit-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          aria-invalid={!!lineError?.credit}
                          {...form.register(`lines.${index}.credit`, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("removeLine")}
                          disabled={fields.length <= 2}
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {(lineError?.debit || lineError?.credit) && (
                      <FieldError
                        errors={[lineError.debit ?? lineError.credit].filter(
                          Boolean,
                        )}
                      />
                    )}
                    {typeof lineError?.message === "string" &&
                      ["oneSideOnly", "amountRequired"].includes(
                        lineError.message,
                      ) && (
                        <p className="text-destructive text-sm">
                          {t(`validation.${lineError.message}`)}
                        </p>
                      )}
                  </div>
                );
              })}
            </div>

            {typeof form.formState.errors.lines?.message === "string" &&
              form.formState.errors.lines.message === "mustBalance" && (
                <p className="text-destructive text-sm">
                  {t("validation.mustBalance")}
                </p>
              )}

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ accountId: "", debit: 0, credit: 0, memo: "" })
                }
              >
                <Plus className="h-4 w-4" />
                {t("addLine")}
              </Button>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  {t("totalDebit")}:
                </span>
                <span className="font-mono tabular-nums">
                  {totalDebit.toFixed(2)}
                </span>
                <span className="text-muted-foreground">
                  {t("totalCredit")}:
                </span>
                <span className="font-mono tabular-nums">
                  {totalCredit.toFixed(2)}
                </span>
                <Badge variant={balanced ? "secondary" : "destructive"}>
                  {balanced ? t("balanced") : t("unbalanced")}
                </Badge>
              </div>
            </div>
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
            form="entry-dialog-form"
            disabled={mutation.isPending || !balanced}
          >
            {mutation.isPending ? t("posting") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
