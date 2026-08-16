"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PaginatedTableFrame } from "@repo/frontend";
import { currencySymbol } from "@repo/shared";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipButton,
} from "@repo/ui";
import {
  ArrowUpDown,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

const DEFAULT_TIME_ZONE = "UTC";
const MINUTES_PER_DAY = 1440;
const START_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

type TimeInterval = [number, number];

interface PricingPolicyItem {
  input: number;
  cachedInput: number;
  output: number;
  startMinutes: number;
  endMinutes: number;
}

interface PricingPolicyFormItem {
  input: number;
  cachedInput: number;
  output: number;
  timeStart: string;
  timeEnd: string;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function sortPolicyFieldsByStart(
  fields: Array<{ id: string }>,
  getStart: (index: number) => string | undefined,
  move: (from: number, to: number) => void,
) {
  const order = fields
    .map((_, index) => index)
    .sort((a, b) => {
      const rawA = getStart(a);
      const rawB = getStart(b);
      const startA = rawA ? timeToMinutes(rawA) : Number.POSITIVE_INFINITY;
      const startB = rawB ? timeToMinutes(rawB) : Number.POSITIVE_INFINITY;
      return (
        (Number.isFinite(startA) ? startA : Number.POSITIVE_INFINITY) -
        (Number.isFinite(startB) ? startB : Number.POSITIVE_INFINITY)
      );
    });

  const current = order.map((_, index) => index);
  for (let position = 0; position < order.length; position++) {
    const desired = order[position];
    if (current[position] === desired) continue;
    const from = current.indexOf(desired, position);
    move(from, position);
    const [item] = current.splice(from, 1);
    current.splice(position, 0, item);
  }
}

function formatTimeRange(start: number, end: number) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

function PolicyCell({
  policy,
  currency,
}: {
  policy: PricingPolicyItem[];
  currency: string;
}) {
  const t = useTranslations("AiSettings");
  const line = (item: PricingPolicyItem) =>
    [
      formatTimeRange(item.startMinutes, item.endMinutes),
      `${currency}${item.input} / ${currency}${item.cachedInput} / ${currency}${item.output}`,
    ].join(" · ");
  if (policy.length <= 1) {
    return <div className="text-xs">{line(policy[0])}</div>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex cursor-default items-center gap-1 text-left outline-hidden"
          >
            <span className="text-xs">{line(policy[0])}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent className="w-max max-w-none">
        <table className="text-xs font-mono whitespace-nowrap">
          <thead>
            <tr className="text-muted-foreground">
              <th className="p-1.5 pr-4 text-left font-medium">
                {t("timePeriod")}
              </th>
              <th className="p-1.5 pr-4 text-left font-medium">{t("input")}</th>
              <th className="p-1.5 pr-4 text-left font-medium">
                {t("cachedInput")}
              </th>
              <th className="p-1.5 text-left font-medium">{t("output")}</th>
            </tr>
          </thead>
          <tbody>
            {policy.map((item) => (
              <tr key={`${item.startMinutes}-${item.endMinutes}`}>
                <td className="p-1.5 pr-4">
                  {formatTimeRange(item.startMinutes, item.endMinutes)}
                </td>
                <td className="p-1.5 pr-4">
                  {currency}
                  {item.input}
                </td>
                <td className="p-1.5 pr-4">
                  {currency}
                  {item.cachedInput}
                </td>
                <td className="p-1.5">
                  {currency}
                  {item.output}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function normalizeTimeRange(start: number, end: number): TimeInterval[] {
  if (start === 0 && end === MINUTES_PER_DAY) return [[0, MINUTES_PER_DAY]];
  if (start < end) return [[start, end]];

  const intervals: TimeInterval[] = [[start, MINUTES_PER_DAY]];
  if (end > 0) intervals.push([0, end]);
  return intervals;
}

function effectiveRangesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null,
) {
  const aStart = new Date(aFrom).getTime();
  const aEnd = aTo ? new Date(aTo).getTime() : Number.POSITIVE_INFINITY;
  const bStart = new Date(bFrom).getTime();
  const bEnd = bTo ? new Date(bTo).getTime() : Number.POSITIVE_INFINITY;
  return aStart < bEnd && bStart < aEnd;
}

function policyFormToPayload(
  policy: PricingPolicyFormItem[],
): PricingPolicyItem[] {
  return policy.map((item) => ({
    input: Number(item.input),
    cachedInput: Number(item.cachedInput),
    output: Number(item.output),
    startMinutes: timeToMinutes(item.timeStart),
    endMinutes: timeToMinutes(item.timeEnd),
  }));
}

function policyToFormItems(
  policy: PricingPolicyItem[],
): PricingPolicyFormItem[] {
  return policy.map((item) => ({
    input: item.input,
    cachedInput: item.cachedInput,
    output: item.output,
    timeStart: minutesToTime(item.startMinutes),
    timeEnd: minutesToTime(item.endMinutes),
  }));
}

function fieldErrorMessage(error: unknown): { message: string } | undefined {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return { message };
    }
  }
  return undefined;
}

function policyErrorMessage(error: unknown): { message: string } | undefined {
  if (error && typeof error === "object" && "root" in error) {
    return fieldErrorMessage((error as { root?: unknown }).root);
  }
  return fieldErrorMessage(error);
}

function validatePolicy(policy: PricingPolicyItem[]) {
  if (policy.length === 0) return false;

  const intervals: TimeInterval[] = [];
  for (const item of policy) {
    if (
      item.input < 0 ||
      item.cachedInput < 0 ||
      item.output < 0 ||
      item.startMinutes < 0 ||
      item.startMinutes > MINUTES_PER_DAY - 1 ||
      item.endMinutes < 0 ||
      item.endMinutes > MINUTES_PER_DAY ||
      item.startMinutes === item.endMinutes
    ) {
      return false;
    }
    intervals.push(...normalizeTimeRange(item.startMinutes, item.endMinutes));
  }

  intervals.sort((a, b) => a[0] - b[0]);
  let coveredUntil = 0;
  for (const [start, end] of intervals) {
    if (start !== coveredUntil) return false;
    coveredUntil = end;
  }
  return coveredUntil === MINUTES_PER_DAY;
}

function makePricingSchemas(t: (key: string) => string) {
  const base = z.object({
    modelId: z.string().min(1),
    accountId: z.string().min(1),
    timeZone: z
      .string()
      .min(1)
      .refine(isValidTimeZone, {
        message: t("invalidTimeZone"),
      }),
    policy: z
      .array(
        z.object({
          input: z.coerce.number().nonnegative(),
          cachedInput: z.coerce.number().nonnegative(),
          output: z.coerce.number().nonnegative(),
          timeStart: z.string().regex(START_TIME_PATTERN, t("invalidTime")),
          timeEnd: z.string().regex(END_TIME_PATTERN, t("invalidTime")),
        }),
      )
      .min(1),
    effectiveFrom: z.string().min(1),
    effectiveTo: z.string().optional(),
  });

  function refine(
    data: {
      policy: PricingPolicyFormItem[];
      effectiveFrom: string;
      effectiveTo?: string;
    },
    ctx: z.RefinementCtx,
  ) {
    if (!validatePolicy(policyFormToPayload(data.policy))) {
      ctx.addIssue({
        code: "custom",
        path: ["policy"],
        message: t("policyCoverAllDay"),
      });
    }
    if (
      data.effectiveTo &&
      new Date(data.effectiveTo) <= new Date(data.effectiveFrom)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: t("effectiveEndAfterStart"),
      });
    }
  }

  const createSchema = base.superRefine(refine);
  const updateSchema = base
    .omit({ modelId: true, accountId: true })
    .superRefine(refine);

  return { createSchema, updateSchema };
}

interface PricingRow {
  id: string;
  modelId: string;
  accountId: string;
  timeZone: string;
  policy: PricingPolicyItem[];
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

interface PricingCandidate {
  id?: string;
  modelId: string;
  accountId: string;
  timeZone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function ModelPricingTable({
  model,
}: {
  model?: { id: string; displayName: string };
}) {
  const t = useTranslations("AiSettings");
  const { createSchema, updateSchema } = useMemo(
    () => makePricingSchemas(t),
    [t],
  );
  type CreateFormValues = z.infer<typeof createSchema>;
  type UpdateFormValues = z.infer<typeof updateSchema>;

  const [co, setCo] = useState(false);
  const [ei, setEi] = useState<PricingRow | null>(null);
  const [di, setDi] = useState<PricingRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<
    Array<{ id: string; displayName: string }>
  >([]);
  const [accounts, setAccounts] = useState<
    Array<{ id: string; name: string; currency: string }>
  >([]);

  useEffect(() => {
    if (model) {
      setModels([model]);
      return;
    }
    appClient.api.ai.models
      .$get({ query: { limit: 100 } })
      .then((r) => r.json())
      .then((d) => setModels(d.models))
      .catch(() => {});
  }, [model]);
  useEffect(() => {
    appClient.api.ai.accounts
      .$get({ query: { limit: 100 } })
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts))
      .catch(() => {});
  }, []);

  const {
    items: pricing,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<PricingRow>({
    queryKey: ["ai-model-pricing", { modelId: model?.id }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.ai["model-pricing"].$get)(
        { query: { limit, offset, modelId: model?.id } },
      );
      const d = await res.json();
      return { items: d.pricing, total: d.total };
    },
  });

  async function hc() {
    setSaving(true);
    try {
      const b = createForm.getValues();
      const candidate = {
        modelId: b.modelId,
        accountId: b.accountId,
        timeZone: b.timeZone,
        effectiveFrom: new Date(b.effectiveFrom).toISOString(),
        effectiveTo: b.effectiveTo
          ? new Date(b.effectiveTo).toISOString()
          : null,
      };
      const policy = policyFormToPayload(b.policy);
      if (await hasPricingOverlap(candidate)) {
        toast.error(t("pricingTimeConflict"));
        return;
      }
      await withApiFeedback(appClient.api.ai["model-pricing"].$post)({
        json: {
          modelId: b.modelId,
          accountId: b.accountId,
          timeZone: candidate.timeZone,
          policy,
          effectiveFrom: candidate.effectiveFrom,
          effectiveTo: candidate.effectiveTo,
        },
      });
      setCo(false);
      createForm.reset();
      refresh();
      toast.success(t("created"));
    } catch {
    } finally {
      setSaving(false);
    }
  }
  function openEdit(p: PricingRow) {
    updateForm.reset({
      timeZone: p.timeZone,
      policy: policyToFormItems(p.policy),
      effectiveFrom: p.effectiveFrom.substring(0, 10),
      effectiveTo: p.effectiveTo?.substring(0, 10) ?? "",
    });
    setEi(p);
  }

  async function hu() {
    if (!ei) return;
    setSaving(true);
    try {
      const b = updateForm.getValues();
      const candidate = {
        id: ei.id,
        modelId: ei.modelId,
        accountId: ei.accountId,
        timeZone: b.timeZone,
        effectiveFrom: new Date(b.effectiveFrom).toISOString(),
        effectiveTo: b.effectiveTo
          ? new Date(b.effectiveTo).toISOString()
          : null,
      };
      const policy = policyFormToPayload(b.policy);
      if (await hasPricingOverlap(candidate)) {
        toast.error(t("pricingTimeConflict"));
        return;
      }
      await withApiFeedback(appClient.api.ai["model-pricing"][":id"].$put)({
        param: { id: ei.id },
        json: {
          timeZone: candidate.timeZone,
          policy,
          effectiveFrom: candidate.effectiveFrom,
          effectiveTo: candidate.effectiveTo,
        },
      });
      setEi(null);
      updateForm.reset();
      refresh();
      toast.success(t("updated"));
    } catch {
    } finally {
      setSaving(false);
    }
  }
  async function hd() {
    if (!di) return;
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.ai["model-pricing"][":id"].$delete)({
        param: { id: di.id },
      });
      setDi(null);
      refresh();
      toast.success(t("deleted"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(
      createSchema,
    ) as unknown as Resolver<CreateFormValues>,
    defaultValues: {
      modelId: model?.id ?? "",
      accountId: "",
      timeZone: DEFAULT_TIME_ZONE,
      policy: policyToFormItems([
        {
          input: 0,
          cachedInput: 0,
          output: 0,
          startMinutes: 0,
          endMinutes: MINUTES_PER_DAY,
        },
      ]),
      effectiveFrom: "",
      effectiveTo: "",
    },
  });
  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(
      updateSchema,
    ) as unknown as Resolver<UpdateFormValues>,
  });
  const createPolicyFields = useFieldArray({
    control: createForm.control,
    name: "policy",
  });
  const updatePolicyFields = useFieldArray({
    control: updateForm.control,
    name: "policy",
  });
  const [createActiveIndex, setCreateActiveIndex] = useState("0");
  const [updateActiveIndex, setUpdateActiveIndex] = useState("0");

  useEffect(() => {
    const count = createPolicyFields.fields.length;
    if (count === 0) return;
    const index = Number(createActiveIndex);
    if (!Number.isInteger(index) || index >= count) {
      setCreateActiveIndex(String(count - 1));
    }
  }, [createActiveIndex, createPolicyFields.fields.length]);

  useEffect(() => {
    const count = updatePolicyFields.fields.length;
    if (count === 0) return;
    const index = Number(updateActiveIndex);
    if (!Number.isInteger(index) || index >= count) {
      setUpdateActiveIndex(String(count - 1));
    }
  }, [updateActiveIndex, updatePolicyFields.fields.length]);

  async function loadPricingForScope(modelId: string, accountId: string) {
    const rows: PricingRow[] = [];
    let offset = 0;
    let total = 0;
    let count = 0;
    do {
      const res = await withApiFeedback(appClient.api.ai["model-pricing"].$get)(
        {
          query: { limit: 100, offset, modelId, accountId },
        },
      );
      const data = await res.json();
      rows.push(...data.pricing);
      total = data.total;
      count = data.pricing.length;
      offset += count;
    } while (count > 0 && rows.length < total);
    return rows;
  }

  async function hasPricingOverlap(candidate: PricingCandidate) {
    const rows = await loadPricingForScope(
      candidate.modelId,
      candidate.accountId,
    );
    return rows.some(
      (row) =>
        row.id !== candidate.id &&
        row.timeZone === candidate.timeZone &&
        effectiveRangesOverlap(
          candidate.effectiveFrom,
          candidate.effectiveTo,
          row.effectiveFrom,
          row.effectiveTo,
        ),
    );
  }

  const mn = (id: string) => models.find((m) => m.id === id)?.displayName ?? id;
  const an = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const ac = (id: string) => accounts.find((a) => a.id === id)?.currency ?? "";
  const modelSelect = (form: typeof createForm) => {
    const value = String(form.watch("modelId") ?? "");
    return (
      <Select
        value={value}
        onValueChange={(v) => form.setValue("modelId", v ?? "")}
      >
        <SelectTrigger>
          <SelectValue>{value ? mn(value) : ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={pricing.length === 0}
        emptyMessage={t("noPricing")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex justify-end w-full">
            <Button size="sm" onClick={() => setCo(true)}>
              <Plus />
              {t("add")}
            </Button>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            {!model && <TableHead>{t("model")}</TableHead>}
            <TableHead>{t("account")}</TableHead>
            <TableHead>{t("timeZone")}</TableHead>
            <TableHead>{t("policy")}</TableHead>
            <TableHead>{t("effectiveFrom")}</TableHead>
            <TableHead>{t("effectiveTo")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.map((p) => (
            <TableRow key={p.id}>
              {!model && <TableCell>{mn(p.modelId)}</TableCell>}
              <TableCell>{an(p.accountId)}</TableCell>
              <TableCell>{p.timeZone}</TableCell>
              <TableCell>
                <PolicyCell
                  policy={p.policy}
                  currency={currencySymbol(ac(p.accountId))}
                />
              </TableCell>
              <TableCell>{formatDate(p.effectiveFrom)}</TableCell>
              <TableCell>
                {p.effectiveTo ? formatDate(p.effectiveTo) : "-"}
              </TableCell>
              <TableCell>{formatDate(p.createdAt)}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <>
                    <DropdownMenuItem onClick={() => openEdit(p)}>
                      <Pencil />
                      {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDi(p)}
                    >
                      <Trash2 />
                      {t("delete")}
                    </DropdownMenuItem>
                  </>
                }
              >
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => openEdit(p)}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDi(p)}
                  >
                    <Trash2 />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog open={co} onOpenChange={setCo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("createPricing")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="cp-form" onSubmit={createForm.handleSubmit(hc)}>
              <FieldGroup>
                {!model && (
                  <Field>
                    <FieldLabel required>{t("model")}</FieldLabel>
                    {modelSelect(createForm)}
                  </Field>
                )}
                <Field>
                  <FieldLabel required>{t("account")}</FieldLabel>
                  <Select
                    value={createForm.watch("accountId") ?? ""}
                    onValueChange={(v) =>
                      createForm.setValue("accountId", v ?? "")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {createForm.watch("accountId")
                          ? `${an(String(createForm.watch("accountId")))} (${ac(
                              String(createForm.watch("accountId")),
                            )})`
                          : ""}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="cp-tz" required>
                    {t("timeZone")}
                  </FieldLabel>
                  <Input
                    id="cp-tz"
                    placeholder="UTC"
                    {...createForm.register("timeZone")}
                  />
                  <FieldError
                    errors={
                      createForm.formState.errors.timeZone
                        ? [createForm.formState.errors.timeZone]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("policy")}</FieldLabel>
                  <FieldError
                    errors={[
                      policyErrorMessage(createForm.formState.errors.policy),
                    ]}
                  />
                  <Tabs
                    orientation="vertical"
                    value={createActiveIndex}
                    onValueChange={setCreateActiveIndex}
                  >
                    <div className="flex shrink-0 flex-col gap-2">
                      <TabsList variant="line" className="w-full">
                        {createPolicyFields.fields.map((field, index) => {
                          const start = createForm.watch(
                            `policy.${index}.timeStart`,
                          );
                          const end = createForm.watch(
                            `policy.${index}.timeEnd`,
                          );
                          return (
                            <TabsTrigger
                              key={field.id}
                              value={String(index)}
                              render={<div className="cursor-default" />}
                              nativeButton={false}
                            >
                              {start && end
                                ? `${start} - ${end}`
                                : `${t("policy")} ${index + 1}`}
                              {createPolicyFields.fields.length > 1 && (
                                <button
                                  type="button"
                                  aria-label={t("delete")}
                                  className="ml-auto inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    createPolicyFields.remove(index);
                                  }}
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={createPolicyFields.fields.length <= 1}
                          onClick={() =>
                            sortPolicyFieldsByStart(
                              createPolicyFields.fields,
                              (index) =>
                                createForm.watch(`policy.${index}.timeStart`),
                              createPolicyFields.move,
                            )
                          }
                        >
                          <ArrowUpDown />
                          {t("sort")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            createPolicyFields.append({
                              input: 0,
                              cachedInput: 0,
                              output: 0,
                              timeStart: "00:00",
                              timeEnd: "24:00",
                            })
                          }
                        >
                          <Plus />
                          {t("add")}
                        </Button>
                      </div>
                    </div>
                    {createPolicyFields.fields.map((field, index) => (
                      <TabsContent
                        key={field.id}
                        value={String(index)}
                        className="space-y-3"
                      >
                        <Field>
                          <FieldLabel
                            required
                            htmlFor={`cp-policy-${index}-start`}
                          >
                            {t("timeStart")}
                          </FieldLabel>
                          <Input
                            id={`cp-policy-${index}-start`}
                            placeholder="00:00"
                            {...createForm.register(
                              `policy.${index}.timeStart`,
                            )}
                          />
                          <FieldError
                            errors={[
                              fieldErrorMessage(
                                createForm.formState.errors.policy?.[index]
                                  ?.timeStart,
                              ),
                            ]}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            required
                            htmlFor={`cp-policy-${index}-end`}
                          >
                            {t("timeEnd")}
                          </FieldLabel>
                          <Input
                            id={`cp-policy-${index}-end`}
                            placeholder="24:00"
                            {...createForm.register(`policy.${index}.timeEnd`)}
                          />
                          <FieldError
                            errors={[
                              fieldErrorMessage(
                                createForm.formState.errors.policy?.[index]
                                  ?.timeEnd,
                              ),
                            ]}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            required
                            htmlFor={`cp-policy-${index}-input`}
                          >
                            {t("input")}
                          </FieldLabel>
                          <Input
                            id={`cp-policy-${index}-input`}
                            type="number"
                            step="0.0001"
                            {...createForm.register(`policy.${index}.input`)}
                          />
                          <FieldError
                            errors={[
                              fieldErrorMessage(
                                createForm.formState.errors.policy?.[index]
                                  ?.input,
                              ),
                            ]}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            required
                            htmlFor={`cp-policy-${index}-cached`}
                          >
                            {t("cachedInput")}
                          </FieldLabel>
                          <Input
                            id={`cp-policy-${index}-cached`}
                            type="number"
                            step="0.0001"
                            {...createForm.register(
                              `policy.${index}.cachedInput`,
                            )}
                          />
                          <FieldError
                            errors={[
                              fieldErrorMessage(
                                createForm.formState.errors.policy?.[index]
                                  ?.cachedInput,
                              ),
                            ]}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            required
                            htmlFor={`cp-policy-${index}-output`}
                          >
                            {t("output")}
                          </FieldLabel>
                          <Input
                            id={`cp-policy-${index}-output`}
                            type="number"
                            step="0.0001"
                            {...createForm.register(`policy.${index}.output`)}
                          />
                          <FieldError
                            errors={[
                              fieldErrorMessage(
                                createForm.formState.errors.policy?.[index]
                                  ?.output,
                              ),
                            ]}
                          />
                        </Field>
                      </TabsContent>
                    ))}
                  </Tabs>
                </Field>
                <Field>
                  <FieldLabel htmlFor="cp-ef" required>
                    {t("effectiveFrom")}
                  </FieldLabel>
                  <Input
                    id="cp-ef"
                    type="date"
                    {...createForm.register("effectiveFrom")}
                  />
                  <FieldError
                    errors={
                      createForm.formState.errors.effectiveFrom
                        ? [createForm.formState.errors.effectiveFrom]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cp-et">{t("effectiveTo")}</FieldLabel>
                  <Input
                    id="cp-et"
                    type="date"
                    {...createForm.register("effectiveTo")}
                  />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCo(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="cp-form" disabled={saving}>
              {saving ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!ei}
        onOpenChange={(o) => {
          if (!o) setEi(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editPricing")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="ep-form" onSubmit={updateForm.handleSubmit(hu)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel>{t("account")}</FieldLabel>
                    <Input
                      value={`${an(ei.accountId)} (${ac(ei.accountId)})`}
                      disabled
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ep-tz" required>
                      {t("timeZone")}
                    </FieldLabel>
                    <Input
                      id="ep-tz"
                      placeholder="UTC"
                      {...updateForm.register("timeZone")}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.timeZone
                          ? [updateForm.formState.errors.timeZone]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("policy")}</FieldLabel>
                    <FieldError
                      errors={[
                        policyErrorMessage(updateForm.formState.errors.policy),
                      ]}
                    />
                    <Tabs
                      orientation="vertical"
                      value={updateActiveIndex}
                      onValueChange={setUpdateActiveIndex}
                    >
                      <div className="flex shrink-0 flex-col gap-2">
                        <TabsList variant="line" className="w-full">
                          {updatePolicyFields.fields.map((field, index) => {
                            const start = updateForm.watch(
                              `policy.${index}.timeStart`,
                            );
                            const end = updateForm.watch(
                              `policy.${index}.timeEnd`,
                            );
                            return (
                              <TabsTrigger
                                key={field.id}
                                value={String(index)}
                                render={<div className="cursor-default" />}
                                nativeButton={false}
                              >
                                {start && end
                                  ? `${start} - ${end}`
                                  : `${t("policy")} ${index + 1}`}
                                {updatePolicyFields.fields.length > 1 && (
                                  <button
                                    type="button"
                                    aria-label={t("delete")}
                                    className="ml-auto inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updatePolicyFields.remove(index);
                                    }}
                                  >
                                    <X className="size-3" />
                                  </button>
                                )}
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updatePolicyFields.fields.length <= 1}
                            onClick={() =>
                              sortPolicyFieldsByStart(
                                updatePolicyFields.fields,
                                (index) =>
                                  updateForm.watch(`policy.${index}.timeStart`),
                                updatePolicyFields.move,
                              )
                            }
                          >
                            <ArrowUpDown />
                            {t("sort")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updatePolicyFields.append({
                                input: 0,
                                cachedInput: 0,
                                output: 0,
                                timeStart: "00:00",
                                timeEnd: "24:00",
                              })
                            }
                          >
                            <Plus />
                            {t("add")}
                          </Button>
                        </div>
                      </div>
                      {updatePolicyFields.fields.map((field, index) => (
                        <TabsContent
                          key={field.id}
                          value={String(index)}
                          className="space-y-3"
                        >
                          <Field>
                            <FieldLabel
                              required
                              htmlFor={`ep-policy-${index}-start`}
                            >
                              {t("timeStart")}
                            </FieldLabel>
                            <Input
                              id={`ep-policy-${index}-start`}
                              placeholder="00:00"
                              {...updateForm.register(
                                `policy.${index}.timeStart`,
                              )}
                            />
                            <FieldError
                              errors={[
                                fieldErrorMessage(
                                  updateForm.formState.errors.policy?.[index]
                                    ?.timeStart,
                                ),
                              ]}
                            />
                          </Field>
                          <Field>
                            <FieldLabel
                              required
                              htmlFor={`ep-policy-${index}-end`}
                            >
                              {t("timeEnd")}
                            </FieldLabel>
                            <Input
                              id={`ep-policy-${index}-end`}
                              placeholder="24:00"
                              {...updateForm.register(
                                `policy.${index}.timeEnd`,
                              )}
                            />
                            <FieldError
                              errors={[
                                fieldErrorMessage(
                                  updateForm.formState.errors.policy?.[index]
                                    ?.timeEnd,
                                ),
                              ]}
                            />
                          </Field>
                          <Field>
                            <FieldLabel
                              required
                              htmlFor={`ep-policy-${index}-input`}
                            >
                              {t("input")}
                            </FieldLabel>
                            <Input
                              id={`ep-policy-${index}-input`}
                              type="number"
                              step="0.0001"
                              {...updateForm.register(`policy.${index}.input`)}
                            />
                            <FieldError
                              errors={[
                                fieldErrorMessage(
                                  updateForm.formState.errors.policy?.[index]
                                    ?.input,
                                ),
                              ]}
                            />
                          </Field>
                          <Field>
                            <FieldLabel
                              required
                              htmlFor={`ep-policy-${index}-cached`}
                            >
                              {t("cachedInput")}
                            </FieldLabel>
                            <Input
                              id={`ep-policy-${index}-cached`}
                              type="number"
                              step="0.0001"
                              {...updateForm.register(
                                `policy.${index}.cachedInput`,
                              )}
                            />
                            <FieldError
                              errors={[
                                fieldErrorMessage(
                                  updateForm.formState.errors.policy?.[index]
                                    ?.cachedInput,
                                ),
                              ]}
                            />
                          </Field>
                          <Field>
                            <FieldLabel
                              required
                              htmlFor={`ep-policy-${index}-output`}
                            >
                              {t("output")}
                            </FieldLabel>
                            <Input
                              id={`ep-policy-${index}-output`}
                              type="number"
                              step="0.0001"
                              {...updateForm.register(`policy.${index}.output`)}
                            />
                            <FieldError
                              errors={[
                                fieldErrorMessage(
                                  updateForm.formState.errors.policy?.[index]
                                    ?.output,
                                ),
                              ]}
                            />
                          </Field>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ep-ef" required>
                      {t("effectiveFrom")}
                    </FieldLabel>
                    <Input
                      id="ep-ef"
                      type="date"
                      {...updateForm.register("effectiveFrom")}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.effectiveFrom
                          ? [updateForm.formState.errors.effectiveFrom]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ep-et">{t("effectiveTo")}</FieldLabel>
                    <Input
                      id="ep-et"
                      type="date"
                      {...updateForm.register("effectiveTo")}
                    />
                  </Field>
                </FieldGroup>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEi(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="ep-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!di}
        onOpenChange={(o) => {
          if (!o) setDi(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deletePricing")}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDi(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={hd} disabled={saving}>
              {saving ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
