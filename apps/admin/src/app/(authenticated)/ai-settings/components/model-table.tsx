"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PaginatedTableFrame } from "@repo/frontend";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  type FieldValues,
  type Resolver,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

const createSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.string().optional(),
  contextWindow: z.coerce.number().int().optional(),
  supportsReasoning: z.boolean().optional(),
  supportsCaching: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  capabilities: z.string().optional(),
  contextWindow: z.coerce.number().int().optional(),
  supportsReasoning: z.boolean().optional(),
  supportsCaching: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

type ModelCreateFormValues = z.infer<typeof createSchema>;
type ModelUpdateFormValues = z.infer<typeof updateSchema>;

interface AiModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: string[];
  contextWindow: number | null;
  supportsReasoning: boolean;
  supportsCaching: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function ModelTable() {
  const t = useTranslations("AiSettings");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<AiModel | null>(null);
  const [deleteItem, setDeleteItem] = useState<AiModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
  useEffect(() => {
    appClient.api.ai.providers
      .$get({ query: { limit: 100 } })
      .then((r) => r.json())
      .then((d) => setProviders(d.providers))
      .catch(() => {});
  }, []);

  const {
    items: models,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<AiModel>({
    queryKey: ["ai-models", { search: debouncedSearch || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.ai.models.$get)({
        query: { limit, offset, search: debouncedSearch || undefined },
      });
      const data = await res.json();
      return { items: data.models, total: data.total };
    },
  });

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const b = createForm.getValues();
      const payload = {
        ...b,
        capabilities: b.capabilities
          ? b.capabilities
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
        contextWindow: b.contextWindow ? Number(b.contextWindow) : null,
      };
      await withApiFeedback(appClient.api.ai.models.$post)({
        json: payload,
      });
      setCreateOpen(false);
      createForm.reset();
      refresh();
      toast.success(t("created"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    try {
      const b = updateForm.getValues();
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        if (v === undefined || v === "") continue;
        if (k === "capabilities")
          payload[k] = (v as string)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        else if (k === "contextWindow") payload[k] = v || null;
        else payload[k] = v;
      }
      await withApiFeedback(appClient.api.ai.models[":id"].$put)({
        param: { id: editItem.id },
        json: payload,
      });
      setEditItem(null);
      updateForm.reset();
      refresh();
      toast.success(t("updated"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.ai.models[":id"].$delete)({
        param: { id: deleteItem.id },
      });
      setDeleteItem(null);
      refresh();
      toast.success(t("deleted"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  const createForm = useForm<ModelCreateFormValues>({
    resolver: zodResolver(
      createSchema,
    ) as unknown as Resolver<ModelCreateFormValues>,
    defaultValues: {
      providerId: "",
      modelId: "",
      displayName: "",
      capabilities: "",
      contextWindow: undefined,
      supportsReasoning: false,
      supportsCaching: false,
      enabled: true,
    },
  });
  const updateForm = useForm<ModelUpdateFormValues>({
    resolver: zodResolver(
      updateSchema,
    ) as unknown as Resolver<ModelUpdateFormValues>,
  });

  const provName = (id: string) =>
    providers.find((p) => p.id === id)?.name ?? id;
  const provSelect = (form: UseFormReturn<FieldValues>) => {
    const value = String(form.watch("providerId") ?? "");
    return (
      <Select
        value={value}
        onValueChange={(v) => form.setValue("providerId", v)}
      >
        <SelectTrigger>
          <SelectValue>{value ? provName(value) : ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const formFields = (
    form: UseFormReturn<FieldValues>,
    prefix: string,
    isCreate: boolean,
  ) => (
    <FieldGroup>
      {isCreate && (
        <>
          <Field>
            <FieldLabel>{t("provider")}</FieldLabel>
            {provSelect(form)}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-modelId`}>
              {t("modelId")}
            </FieldLabel>
            <Input
              id={`${prefix}-modelId`}
              {...(form.register("modelId") as object)}
            />
          </Field>
        </>
      )}
      <Field>
        <FieldLabel htmlFor={`${prefix}-displayName`}>
          {t("displayName")}
        </FieldLabel>
        <Input
          id={`${prefix}-displayName`}
          {...(form.register("displayName") as object)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-cap`}>{t("capabilities")}</FieldLabel>
        <Input
          id={`${prefix}-cap`}
          {...(form.register("capabilities") as object)}
          placeholder="tool-use, vision"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-ctx`}>{t("contextWindow")}</FieldLabel>
        <Input
          id={`${prefix}-ctx`}
          type="number"
          {...(form.register("contextWindow") as object)}
        />
      </Field>
      <Field>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.watch("supportsReasoning") ?? false}
            onCheckedChange={(v) => form.setValue("supportsReasoning", v)}
            id={`${prefix}-sr`}
          />
          <FieldLabel htmlFor={`${prefix}-sr`}>
            {t("supportsReasoning")}
          </FieldLabel>
        </div>
      </Field>
      <Field>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.watch("supportsCaching") ?? false}
            onCheckedChange={(v) => form.setValue("supportsCaching", v)}
            id={`${prefix}-sc`}
          />
          <FieldLabel htmlFor={`${prefix}-sc`}>
            {t("supportsCaching")}
          </FieldLabel>
        </div>
      </Field>
      <Field>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.watch("enabled") ?? true}
            onCheckedChange={(v) => form.setValue("enabled", v)}
            id={`${prefix}-en`}
          />
          <FieldLabel htmlFor={`${prefix}-en`}>{t("enabled")}</FieldLabel>
        </div>
      </Field>
    </FieldGroup>
  );

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={models.length === 0}
        emptyMessage={t("noModels")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex items-center gap-3 w-full">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              {t("add")}
            </Button>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("displayName")}</TableHead>
            <TableHead>{t("modelId")}</TableHead>
            <TableHead>{t("provider")}</TableHead>
            <TableHead align="center">{t("enabled")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.displayName}</TableCell>
              <TableCell className="font-mono text-xs">{m.modelId}</TableCell>
              <TableCell>{provName(m.providerId)}</TableCell>
              <TableCell align="center">
                {m.enabled ? t("yes") : t("no")}
              </TableCell>
              <TableCell>{formatDate(m.createdAt)}</TableCell>
              <TableActionCell menuLabel={t("actions")}>
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => {
                      updateForm.reset({
                        displayName: m.displayName,
                        capabilities: (m.capabilities ?? []).join(", "),
                        contextWindow:
                          m.contextWindow ?? ("" as unknown as number),
                        supportsReasoning: m.supportsReasoning,
                        supportsCaching: m.supportsCaching,
                        enabled: m.enabled,
                      });
                      setEditItem(m);
                    }}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDeleteItem(m)}
                  >
                    <Trash2 />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createModel")}</DialogTitle>
            <DialogDescription>{t("createModelDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              id="cmod-form"
              onSubmit={createForm.handleSubmit(handleCreate)}
            >
              {formFields(
                createForm as unknown as UseFormReturn<FieldValues>,
                "cm",
                true,
              )}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="cmod-form" disabled={saving}>
              {saving ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editItem}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editModel")}</DialogTitle>
            <DialogDescription>{t("editModelDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {editItem && (
              <form
                id="emod-form"
                onSubmit={updateForm.handleSubmit(handleUpdate)}
              >
                {formFields(
                  updateForm as unknown as UseFormReturn<FieldValues>,
                  "em",
                  false,
                )}
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="emod-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteItem}
        onOpenChange={(o) => {
          if (!o) setDeleteItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteModel")}</DialogTitle>
            <DialogDescription>
              {t("deleteModelConfirmation", {
                name: deleteItem?.displayName ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
