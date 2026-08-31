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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  MultiSelect,
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
import { useAccountName } from "@/hooks/use-account-name";
import { useLedgers } from "@/hooks/use-ledgers";
import { useProjects } from "@/hooks/use-projects";
import { appClient, withApiFeedback } from "@/lib/api";
import type { AccountRow } from "../../accounts/components/accounts-table";

type QuickKind = "expense" | "income" | "transfer";

/** A pickable account flattened into select order with its nesting depth. */
type AccountEntry = { account: AccountRow; depth: number };

/**
 * Orders accounts parent-first so a Select can render them as a tree:
 * each parent is immediately followed by its (indented) descendants.
 * Orphans — e.g. children of an archived parent — become roots.
 */
function toTreeEntries(
  accounts: AccountRow[],
  nameFor: (account: AccountRow) => string,
): Array<AccountEntry & { label: string }> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const depthOf = (account: AccountRow) => {
    let depth = 0;
    let parent = account.parentId ? byId.get(account.parentId) : undefined;
    while (parent) {
      depth += 1;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return depth;
  };
  const entries: Array<AccountEntry & { label: string }> = [];
  const visit = (list: AccountRow[]) => {
    for (const account of list) {
      entries.push({
        account,
        depth: depthOf(account),
        label: nameFor(account),
      });
      visit(accounts.filter((c) => c.parentId === account.id));
    }
  };
  visit(accounts.filter((a) => !a.parentId || !byId.has(a.parentId)));
  return entries;
}

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
    participants: z.array(z.string()),
    projectId: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!(data.amount > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "amountRequired",
      });
    }
    // The category side must always be picked; the pocket side may stay
    // unselected ("未选择") — the backend then falls back to the ledger's
    // flagged default account for that side. Transfers have no category:
    // both pockets are required.
    if (!(data.kind === "income" ? data.creditAccount : data.debitAccount)) {
      ctx.addIssue({
        code: "custom",
        path: [data.kind === "income" ? "creditAccount" : "debitAccount"],
        message: "accountRequired",
      });
    }
    if (data.kind !== "expense" && !data.creditAccount) {
      ctx.addIssue({
        code: "custom",
        path: ["creditAccount"],
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

interface MemberRow {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string | null } | null;
}

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
  const accountName = useAccountName();
  const queryClient = useQueryClient();
  const { activeLedger } = useLedgers();
  // Guests record expenses inside their projects only: the tabs collapse to
  // "expense", the paying pocket is always the ledger default, and the
  // project assignment is mandatory (pre-filled with their single project).
  const isGuest = activeLedger?.myRole === "guest";
  const { projects } = useProjects(ledgerId, open);

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

  const { data: membersData } = useQuery({
    queryKey: ["qianlai", "members", ledgerId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members.$get,
      )({ param: { ledgerId } });
      return (await res.json()) as { members: MemberRow[] };
    },
    enabled: open && !!ledgerId,
  });

  const activeAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.status === "active",
  );
  const members = membersData?.members ?? [];
  // Asset + liability accounts are the "money pockets": where funds sit or
  // where spending is charged (credit card).
  //
  // The seeded default pocket is hidden from the picks — leaving the pocket
  // at 未选择 lets the backend fall back to it instead.
  const pickableAccounts = activeAccounts.filter(
    (a) =>
      !hasAccountFlag(a.flags, DEFAULT_DEBIT_ACCOUNT_FLAG) &&
      !hasAccountFlag(a.flags, DEFAULT_CREDIT_ACCOUNT_FLAG),
  );
  const assetLikeAccounts = pickableAccounts.filter(
    (a) => a.type === "asset" || a.type === "liability",
  );

  // datetime-local value for "now" with second precision
  // (YYYY-MM-DDTHH:mm:ss), matching the format the input expects.
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const defaultDate =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const defaultValues: QuickEntryFormData = {
    kind: "expense",
    date: defaultDate,
    amount: 0,
    debitAccount: "",
    creditAccount: "",
    memo: "",
    participants: [],
    projectId: "",
  };

  const form = useForm<QuickEntryFormData>({
    resolver: zodResolver(quickEntrySchema),
    defaultValues,
  });

  // Pre-select the project once the list loads: a guest's only project
  // becomes the default; full roles start unassigned ("personal").
  useEffect(() => {
    if (projects.length === 0) return;
    const current = form.getValues("projectId");
    if (current) return;
    if (isGuest && projects.length === 1) {
      form.setValue("projectId", projects[0].id);
    }
  }, [projects, isGuest, form]);

  // Trigger label resolver: empty/unselected renders the explicit
  // 未选择 sentinel instead of a blank trigger.
  function nameFor(value: unknown) {
    if (typeof value !== "string" || value === "") return t("quick.noAccount");
    const account = activeAccounts.find((a) => a.id === value);
    return account ? accountName(account) : t("quick.noAccount");
  }

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

  // Category sides render as a tree (parents before indented children);
  // pocket sides are flat.
  const debitEntries: AccountEntry[] =
    kind === "expense"
      ? toTreeEntries(
          pickableAccounts.filter((a) => a.type === "expense"),
          accountName,
        )
      : kind === "income"
        ? pickableAccounts
            .filter((a) => a.type === "asset")
            .map((account) => ({ account, depth: 0 }))
        : assetLikeAccounts.map((account) => ({ account, depth: 0 }));
  const creditEntries: AccountEntry[] =
    kind === "expense"
      ? assetLikeAccounts.map((account) => ({ account, depth: 0 }))
      : kind === "income"
        ? toTreeEntries(
            pickableAccounts.filter((a) => a.type === "income"),
            accountName,
          )
        : assetLikeAccounts.map((account) => ({ account, depth: 0 }));

  // The pocket side (debit for income, credit for expense) may stay at
  // 未选择 — the backend then falls back to the ledger's default account.
  // Transfers move between two explicit pockets, so nothing is optional.
  const noAccountItem = { value: "", label: t("quick.noAccount"), depth: 0 };
  const toItems = (entries: AccountEntry[], withNoAccount: boolean) => [
    ...(withNoAccount ? [noAccountItem] : []),
    ...entries.map(({ account, depth }) => ({
      value: account.id,
      label: accountName(account),
      depth,
    })),
  ];
  const debitItems = toItems(debitEntries, kind === "income");
  const creditItems = toItems(creditEntries, kind === "expense");

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
          // datetime-local values parse as LOCAL time; sending the ISO
          // instant keeps entry dates true UTC instants, second precision,
          // consistent with the iOS app.
          date: new Date(data.date).toISOString(),
          memo: data.memo || undefined,
          lines: [
            // An unselected pocket side posts as null; the backend resolves
            // it to the ledger's flagged default account for that side.
            { accountId: data.debitAccount || null, debit: amount, credit: 0 },
            { accountId: data.creditAccount || null, debit: 0, credit: amount },
          ],
          participantMemberIds: data.participants.length
            ? data.participants
            : undefined,
          projectId: data.projectId || undefined,
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
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "member-turnover", ledgerId],
      });
      toast.success(t("createSuccess"));
      onOpenChange(false);
      form.reset(defaultValues);
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset({ ...defaultValues, date: defaultDate });
    }
    onOpenChange(nextOpen);
  }

  /** Guests must post inside one of their projects. */
  function handleSubmit(data: QuickEntryFormData) {
    if (isGuest && !data.projectId) {
      form.setError("projectId", { message: "projectRequired" });
      return;
    }
    mutation.mutate(data);
  }

  function handleKindChange(value: QuickKind) {
    // Labels differ per kind; both sides start at 未选择. Leaving the pocket
    // unselected lets the backend fall back to the ledger's default account.
    form.setValue("kind", value);
    form.setValue("debitAccount", "");
    form.setValue("creditAccount", "");
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
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {!isGuest && (
              <Tabs value={kind} onValueChange={handleKindChange}>
                <TabsList className="w-full">
                  <TabsTrigger value="expense">
                    {t("quick.expense")}
                  </TabsTrigger>
                  <TabsTrigger value="income">{t("quick.income")}</TabsTrigger>
                  <TabsTrigger value="transfer">
                    {t("quick.transfer")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <Field data-invalid={!!form.formState.errors.projectId}>
              <FieldLabel htmlFor="quick-project" required={isGuest}>
                {t("quick.project")}
              </FieldLabel>
              <Controller
                control={form.control}
                name="projectId"
                render={({ field, fieldState }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "")}
                    items={[
                      ...(!isGuest
                        ? [{ value: "", label: t("quick.noProject") }]
                        : []),
                      ...projects.map((p) => ({
                        value: p.id,
                        label: p.name,
                      })),
                    ]}
                  >
                    <SelectTrigger
                      id="quick-project"
                      aria-invalid={!!fieldState.error}
                    >
                      <SelectValue>
                        {(value) =>
                          projects.find((p) => p.id === value)?.name ??
                          t("quick.noProject")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {!isGuest && (
                        <SelectItem value="">{t("quick.noProject")}</SelectItem>
                      )}
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                {isGuest ? t("quick.projectGuestHint") : t("quick.projectHint")}
              </FieldDescription>
              <FieldError
                errors={
                  form.formState.errors.projectId
                    ? [
                        {
                          message: t("quick.validation.projectRequired"),
                        },
                      ]
                    : undefined
                }
              />
            </Field>

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
                    type="datetime-local"
                    step="1"
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
                <FieldLabel
                  htmlFor="quick-debit-account"
                  required={kind !== "income"}
                >
                  {labels.debit}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="debitAccount"
                  render={({ field, fieldState }) => (
                    <Select
                      value={field.value || null}
                      onValueChange={field.onChange}
                      items={debitItems}
                    >
                      <SelectTrigger
                        id="quick-debit-account"
                        aria-invalid={!!fieldState.error}
                      >
                        <SelectValue>{(value) => nameFor(value)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {debitItems.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            style={
                              item.depth
                                ? { paddingLeft: `${item.depth * 16 + 6}px` }
                                : undefined
                            }
                          >
                            {item.label}
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

              {!isGuest && (
                <Field data-invalid={!!form.formState.errors.creditAccount}>
                  <FieldLabel
                    htmlFor="quick-credit-account"
                    required={kind !== "expense"}
                  >
                    {labels.credit}
                  </FieldLabel>
                  <Controller
                    control={form.control}
                    name="creditAccount"
                    render={({ field, fieldState }) => (
                      <Select
                        value={field.value || null}
                        onValueChange={field.onChange}
                        items={creditItems}
                      >
                        <SelectTrigger
                          id="quick-credit-account"
                          aria-invalid={!!fieldState.error}
                        >
                          <SelectValue>{(value) => nameFor(value)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {creditItems.map((item) => (
                            <SelectItem
                              key={item.value}
                              value={item.value}
                              style={
                                item.depth
                                  ? { paddingLeft: `${item.depth * 16 + 6}px` }
                                  : undefined
                              }
                            >
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError
                    errors={
                      creditAccountError ? [creditAccountError] : undefined
                    }
                  />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="quick-memo">{t("memo")}</FieldLabel>
                <Input
                  id="quick-memo"
                  {...form.register("memo")}
                  placeholder={t("memoPlaceholder")}
                />
              </Field>

              {members.length > 0 && (
                <Field>
                  <FieldLabel>{t("quick.participants")}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="participants"
                    render={({ field }) => (
                      <MultiSelect
                        options={members.map((member) => ({
                          value: member.id,
                          label: member.user?.name ?? member.userId,
                        }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("quick.participantsPlaceholder")}
                        searchPlaceholder={t("quick.participantsSearch")}
                      />
                    )}
                  />
                  <FieldDescription>
                    {t("quick.participantsHint")}
                  </FieldDescription>
                </Field>
              )}
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
