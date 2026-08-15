"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PaginatedTableFrame } from "@repo/frontend";
import { AI_AGENT_STATUSES, AI_REASONING_LEVELS } from "@repo/shared";
import {
  Button,
  ButtonGroup,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenuItem,
  Field,
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
  Textarea,
  TooltipButton,
} from "@repo/ui";
import { Pencil, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FieldValues,
  type Resolver,
  type UseFormReturn,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

const optionalNumberSchema = z.preprocess(
  (value) => (value === "" || value == null ? undefined : Number(value)),
  z.number().finite().optional(),
);
const optionalIntSchema = z.preprocess(
  (value) => (value === "" || value == null ? undefined : Number(value)),
  z.number().int().optional(),
);
const subAgentSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  modelId: z.string().min(1),
  systemPrompt: z.string().nullable().optional(),
  reasoning: z.enum(AI_REASONING_LEVELS).nullable().optional(),
  temperature: optionalNumberSchema,
  maxSteps: optionalIntSchema,
  maxOutputTokens: optionalIntSchema,
});
const subAgentsSchema = z
  .array(subAgentSchema)
  .min(1)
  .superRefine((items, ctx) => {
    const seen = new Map<string, number>();
    items.forEach((item, index) => {
      const key = item.key.trim();
      const previous = seen.get(key);
      if (previous !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Sub-agent keys must be unique",
          path: [index, "key"],
        });
        ctx.addIssue({
          code: "custom",
          message: "Sub-agent keys must be unique",
          path: [previous, "key"],
        });
        return;
      }
      seen.set(key, index);
    });
  });

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(AI_AGENT_STATUSES).optional(),
  subAgents: subAgentsSchema.optional(),
  allowedApis: z.array(z.string()).optional(),
});

type AgentUpdateFormValues = z.infer<typeof updateSchema>;
type AgentStatus = (typeof AI_AGENT_STATUSES)[number];
type AgentReasoningLevel = (typeof AI_REASONING_LEVELS)[number];
type AgentSubAgentForm = z.infer<typeof subAgentSchema>;
type AgentSubAgent = {
  label: string;
  description?: string;
  modelId: string;
  systemPrompt?: string | null;
  reasoning?: AgentReasoningLevel | null;
  temperature?: number | null;
  maxSteps?: number;
  maxOutputTokens?: number;
};
type AgentSubAgents = Record<string, AgentSubAgent>;

function createDefaultSubAgent(): AgentSubAgentForm {
  return {
    key: "default",
    label: "Default",
    description: "Default sub-agent.",
    modelId: "deepseek-v4-flash",
    systemPrompt: "",
    reasoning: "none",
    maxSteps: 8,
  };
}

function deserializeSubAgents(subAgents?: AgentSubAgents): AgentSubAgentForm[] {
  const items = Object.entries(subAgents ?? {}).map(([key, subAgent]) => ({
    key,
    label: subAgent.label,
    description: subAgent.description ?? "",
    modelId: subAgent.modelId,
    systemPrompt: subAgent.systemPrompt ?? "",
    reasoning: subAgent.reasoning ?? "none",
    temperature: subAgent.temperature ?? undefined,
    maxSteps: subAgent.maxSteps ?? undefined,
    maxOutputTokens: subAgent.maxOutputTokens ?? undefined,
  }));
  return items.length > 0 ? items : [createDefaultSubAgent()];
}

function serializeSubAgents(subAgents?: AgentSubAgentForm[]): AgentSubAgents {
  const result: AgentSubAgents = {};
  for (const subAgent of subAgents ?? []) {
    const key = subAgent.key.trim();
    const description = subAgent.description?.trim();
    const systemPrompt = subAgent.systemPrompt?.trim();
    result[key] = {
      label: subAgent.label.trim(),
      ...(description ? { description } : {}),
      modelId: subAgent.modelId.trim(),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(subAgent.reasoning ? { reasoning: subAgent.reasoning } : {}),
      ...(subAgent.temperature !== undefined
        ? { temperature: subAgent.temperature }
        : {}),
      ...(subAgent.maxSteps !== undefined
        ? { maxSteps: subAgent.maxSteps }
        : {}),
      ...(subAgent.maxOutputTokens !== undefined
        ? { maxOutputTokens: subAgent.maxOutputTokens }
        : {}),
    };
  }
  return result;
}

type AvailableApiOperation = {
  operationId: string;
  method: string;
  path: string;
  summary?: string | null;
  description?: string | null;
  tags?: string[];
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PATCH:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-medium ${METHOD_COLORS[method] ?? "bg-muted text-muted-foreground"}`}
    >
      {method}
    </span>
  );
}

function AllowedApisSelector({
  form,
  t,
}: {
  form: UseFormReturn<FieldValues>;
  t: (key: string) => string;
}) {
  const [available, setAvailable] = useState<AvailableApiOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const selectedIds = (form.watch("allowedApis") as string[] | undefined) ?? [];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await withApiFeedback(
          appClient.api.ai.agents["available-apis"].$get,
        )();
        const data = (await res.json()) as AvailableApiOperation[];
        if (!cancelled) setAvailable(data);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const availableById = useMemo(
    () => new Map(available.map((op) => [op.operationId, op])),
    [available],
  );
  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(
      (op) =>
        op.operationId.toLowerCase().includes(q) ||
        op.path.toLowerCase().includes(q) ||
        op.summary?.toLowerCase().includes(q) ||
        op.description?.toLowerCase().includes(q),
    );
  }, [available, search]);
  const grouped = useMemo(() => {
    const map = new Map<string, AvailableApiOperation[]>();
    for (const op of filtered) {
      const tag = op.tags?.[0] ?? "Other";
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)?.push(op);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const selectedList = useMemo(
    () =>
      selectedIds.map(
        (id) =>
          availableById.get(id) ?? {
            operationId: id,
            method: "API",
            path: id,
          },
      ),
    [availableById, selectedIds],
  );

  function setSelected(next: string[]) {
    form.setValue("allowedApis", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function toggle(operationId: string) {
    if (selectedSet.has(operationId)) {
      setSelected(selectedIds.filter((id) => id !== operationId));
      return;
    }
    setSelected([...selectedIds, operationId]);
  }

  function selectAll() {
    setSelected(available.map((op) => op.operationId));
  }

  function deselectAll() {
    setSelected([]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-md border py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loadError ? (
        <p className="text-sm text-destructive">{t("allowedApisLoadError")}</p>
      ) : null}
      <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex h-96 flex-col overflow-hidden rounded-md border">
          <div className="space-y-3 border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {t("allowedApisAvailable")}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  disabled={loadError}
                >
                  {t("allowedApisSelectAll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={deselectAll}
                >
                  {t("allowedApisDeselectAll")}
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("allowedApisSearchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={loadError}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {grouped.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("noResults")}
              </p>
            ) : (
              grouped.map(([tag, ops]) => (
                <div key={tag}>
                  <div className="sticky top-0 z-10 border-b bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    {tag}
                  </div>
                  {ops.map((op) => {
                    const isSelected = selectedSet.has(op.operationId);
                    return (
                      <label
                        key={op.operationId}
                        className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(op.operationId)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <MethodBadge method={op.method} />
                            <code className="truncate text-sm font-medium">
                              {op.operationId}
                            </code>
                            <span className="truncate text-xs text-muted-foreground">
                              {op.path}
                            </span>
                          </div>
                          {op.summary ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {op.summary}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex h-96 flex-col overflow-hidden rounded-md border">
          <div className="border-b p-3">
            <span className="text-sm font-medium">
              {t("allowedApisSelected")} ({selectedList.length})
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedList.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("allowedApisNoSelection")}
              </p>
            ) : (
              selectedList.map((op) => (
                <div
                  key={op.operationId}
                  className="flex items-center gap-2 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30"
                >
                  <MethodBadge method={op.method} />
                  <code className="truncate text-sm font-medium">
                    {op.operationId}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {op.path}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(op.operationId)}
                    aria-label={t("allowedApisRemove")}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubAgentFields({
  form,
  prefix,
  t,
}: {
  form: UseFormReturn<FieldValues>;
  prefix: string;
  t: (key: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState("0");
  const { fields } = useFieldArray({
    control: form.control,
    name: "subAgents",
  });

  useEffect(() => {
    if (fields.length === 0) return;
    const index = Number(activeIndex);
    if (!Number.isInteger(index) || index >= fields.length) {
      setActiveIndex(String(fields.length - 1));
    }
  }, [activeIndex, fields.length]);

  return (
    <div className="rounded-md border p-3">
      <Tabs value={activeIndex} onValueChange={setActiveIndex}>
        {fields.length > 1 && (
          <TabsList variant="line" className="flex h-auto flex-wrap">
            {fields.map((field, index) => {
              const key = form.watch(`subAgents.${index}.key`) as
                | string
                | undefined;
              return (
                <TabsTrigger key={field.id} value={String(index)}>
                  {key || t("subAgent")}
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}

        {fields.map((field, index) => (
          <TabsContent
            key={field.id}
            value={String(index)}
            className={fields.length > 1 ? "mt-4" : "mt-0"}
          >
            <FieldGroup>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-key`}>
                    {t("subAgentKey")}
                  </FieldLabel>
                  <input
                    type="hidden"
                    {...(form.register(`subAgents.${index}.key`) as object)}
                  />
                  <Input
                    id={`${prefix}-sub-agent-${index}-key`}
                    value={
                      (form.watch(`subAgents.${index}.key`) as string) ?? ""
                    }
                    disabled
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-label`}>
                    {t("subAgentLabel")}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-sub-agent-${index}-label`}
                    {...(form.register(`subAgents.${index}.label`) as object)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-desc`}>
                  {t("descriptionLabel")}
                </FieldLabel>
                <Input
                  id={`${prefix}-sub-agent-${index}-desc`}
                  {...(form.register(
                    `subAgents.${index}.description`,
                  ) as object)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-model`}>
                  {t("modelId")}
                </FieldLabel>
                <Input
                  id={`${prefix}-sub-agent-${index}-model`}
                  {...(form.register(`subAgents.${index}.modelId`) as object)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-prompt`}>
                  {t("systemPrompt")}
                </FieldLabel>
                <Textarea
                  id={`${prefix}-sub-agent-${index}-prompt`}
                  rows={4}
                  {...(form.register(
                    `subAgents.${index}.systemPrompt`,
                  ) as object)}
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>{t("reasoning")}</FieldLabel>
                  <Select
                    value={
                      (form.watch(`subAgents.${index}.reasoning`) as string) ??
                      "none"
                    }
                    onValueChange={(value) =>
                      form.setValue(`subAgents.${index}.reasoning`, value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_REASONING_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-temp`}>
                    {t("temperature")}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-sub-agent-${index}-temp`}
                    type="number"
                    step="0.1"
                    {...(form.register(
                      `subAgents.${index}.temperature`,
                    ) as object)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-steps`}>
                    {t("maxSteps")}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-sub-agent-${index}-steps`}
                    type="number"
                    {...(form.register(
                      `subAgents.${index}.maxSteps`,
                    ) as object)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-sub-agent-${index}-tokens`}>
                    {t("maxOutputTokens")}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-sub-agent-${index}-tokens`}
                    type="number"
                    {...(form.register(
                      `subAgents.${index}.maxOutputTokens`,
                    ) as object)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface AiAgentRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  subAgents: AgentSubAgents;
  allowedApis: string[];
  createdAt: string;
  updatedAt: string;
}

export function AgentTable() {
  const t = useTranslations("AiSettings");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [ei, setEi] = useState<AiAgentRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);

  const {
    items: agents,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<AiAgentRow>({
    queryKey: ["ai-agents", { search: ds || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.ai.agents.$get)({
        query: { limit, offset, search: ds || undefined },
      });
      const d = await res.json();
      return { items: d.agents, total: d.total };
    },
  });

  function hs(v: string) {
    setSearch(v);
    if (dr.current) clearTimeout(dr.current);
    dr.current = setTimeout(() => {
      setDs(v);
      setPage(1);
    }, 300);
  }

  async function hu(b: AgentUpdateFormValues) {
    if (!ei) return;
    setSaving(true);
    try {
      const p: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        if (v === undefined) continue;
        if (v === "") continue;
        if (k === "subAgents")
          p[k] = serializeSubAgents(v as AgentSubAgentForm[]);
        else p[k] = v;
      }
      await withApiFeedback(appClient.api.ai.agents[":id"].$put)({
        param: { id: ei.id },
        json: p,
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
  const updateForm = useForm<AgentUpdateFormValues>({
    resolver: zodResolver(
      updateSchema,
    ) as unknown as Resolver<AgentUpdateFormValues>,
  });

  function openEdit(a: AiAgentRow) {
    updateForm.reset({
      name: a.name,
      description: a.description,
      status: a.status as AgentStatus,
      subAgents: deserializeSubAgents(a.subAgents),
      allowedApis: a.allowedApis ?? [],
    });
    setEi(a);
  }

  const af = (
    form: UseFormReturn<FieldValues>,
    prefix: string,
    isCreate: boolean,
  ) => (
    <FieldGroup>
      {isCreate && (
        <Field>
          <FieldLabel htmlFor={`${prefix}-code`}>{t("code")}</FieldLabel>
          <Input id={`${prefix}-code`} {...(form.register("code") as object)} />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${prefix}-name`}>{t("name")}</FieldLabel>
        <Input id={`${prefix}-name`} {...(form.register("name") as object)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-desc`}>
          {t("descriptionLabel")}
        </FieldLabel>
        <Input
          id={`${prefix}-desc`}
          {...(form.register("description") as object)}
        />
      </Field>
      <Field>
        <FieldLabel>{t("subAgents")}</FieldLabel>
        <SubAgentFields form={form} prefix={prefix} t={t} />
      </Field>
      <Field>
        <FieldLabel>{t("allowedApis")}</FieldLabel>
        <AllowedApisSelector form={form} t={t} />
      </Field>
    </FieldGroup>
  );

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={agents.length === 0}
        emptyMessage={t("noAgents")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex w-full items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => hs(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("code")}</TableHead>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-xs">{a.code}</TableCell>
              <TableCell>{a.name}</TableCell>
              <TableCell>{a.status}</TableCell>
              <TableCell>{formatDate(a.createdAt)}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <DropdownMenuItem onClick={() => openEdit(a)}>
                    <Pencil />
                    {t("edit")}
                  </DropdownMenuItem>
                }
              >
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => openEdit(a)}
                  >
                    <Pencil />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog
        open={!!ei}
        onOpenChange={(o) => {
          if (!o) setEi(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("editAgent")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="ea-form" onSubmit={updateForm.handleSubmit(hu)}>
                {af(
                  updateForm as unknown as UseFormReturn<FieldValues>,
                  "ea",
                  false,
                )}
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEi(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="ea-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
