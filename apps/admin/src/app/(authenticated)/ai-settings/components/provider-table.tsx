"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PaginatedTableFrame } from "@repo/frontend";
import { AI_ADAPTERS } from "@repo/shared";
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
  DropdownMenuItem,
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
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

const AI_ADAPTER_OPTIONS = AI_ADAPTERS;

const createSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  aiAdapter: z.enum(AI_ADAPTER_OPTIONS),
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  aiAdapter: z.enum(AI_ADAPTER_OPTIONS).optional(),
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  aiAdapter: string;
  enabled: boolean;
  description?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export function ProviderTable() {
  const t = useTranslations("AiSettings");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<AiProvider | null>(null);
  const [deleteItem, setDeleteItem] = useState<AiProvider | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const {
    items: providers,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<AiProvider>({
    queryKey: ["ai-providers", { search: debouncedSearch || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.ai.providers.$get)({
        query: { limit, offset, search: debouncedSearch || undefined },
      });
      const data = await res.json();
      return { items: data.providers, total: data.total };
    },
  });

  function handleSearchChange(value: string) {
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
      const body = createForm.getValues();
      await withApiFeedback(appClient.api.ai.providers.$post)({
        json: body,
      });
      setCreateOpen(false);
      createForm.reset();
      refresh();
      toast.success(t("created"));
    } catch {
      // handled by withApiFeedback
    } finally {
      setSaving(false);
    }
  }

  function openEdit(provider: AiProvider) {
    updateForm.reset({
      name: provider.name,
      baseUrl: provider.baseUrl,
      aiAdapter: provider.aiAdapter as (typeof AI_ADAPTER_OPTIONS)[number],
      enabled: provider.enabled,
      description: provider.description ?? null,
    });
    setEditItem(provider);
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    try {
      const body = updateForm.getValues();
      const payload = Object.fromEntries(
        Object.entries(body).filter(([, v]) => v !== undefined),
      );
      await withApiFeedback(appClient.api.ai.providers[":id"].$put)({
        param: { id: editItem.id },
        json: payload,
      });
      setEditItem(null);
      updateForm.reset();
      refresh();
      toast.success(t("updated"));
    } catch {
      // handled by withApiFeedback
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.ai.providers[":id"].$delete)({
        param: { id: deleteItem.id },
      });
      setDeleteItem(null);
      refresh();
      toast.success(t("deleted"));
    } catch {
      // handled by withApiFeedback
    } finally {
      setSaving(false);
    }
  }

  const createForm = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      baseUrl: "",
      aiAdapter: "openai" as (typeof AI_ADAPTER_OPTIONS)[number],
      enabled: true,
      description: null as string | null,
    },
  });

  const updateForm = useForm({
    resolver: zodResolver(updateSchema),
  });

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={providers.length === 0}
        emptyMessage={t("noProviders")}
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
                onChange={(e) => handleSearchChange(e.target.value)}
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
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("baseUrl")}</TableHead>
            <TableHead>{t("aiAdapter")}</TableHead>
            <TableHead align="center">{t("enabled")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <TableRow key={provider.id}>
              <TableCell>{provider.name}</TableCell>
              <TableCell className="font-mono text-xs">
                {provider.baseUrl}
              </TableCell>
              <TableCell>{provider.aiAdapter}</TableCell>
              <TableCell align="center">
                {provider.enabled ? t("yes") : t("no")}
              </TableCell>
              <TableCell>{formatDate(provider.createdAt)}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <>
                    <DropdownMenuItem onClick={() => openEdit(provider)}>
                      <Pencil />
                      {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteItem(provider)}
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
                    onClick={() => openEdit(provider)}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDeleteItem(provider)}
                  >
                    <Trash2 />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createProvider")}</DialogTitle>
            <DialogDescription>{t("createProviderDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              id="create-provider-form"
              onSubmit={createForm.handleSubmit(handleCreate)}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cp-name" required>
                    {t("name")}
                  </FieldLabel>
                  <Input
                    id="cp-name"
                    aria-invalid={!!createForm.formState.errors.name}
                    {...createForm.register("name")}
                  />
                  <FieldError
                    errors={
                      createForm.formState.errors.name
                        ? [createForm.formState.errors.name]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cp-baseUrl" required>
                    {t("baseUrl")}
                  </FieldLabel>
                  <Input
                    id="cp-baseUrl"
                    aria-invalid={!!createForm.formState.errors.baseUrl}
                    {...createForm.register("baseUrl")}
                  />
                  <FieldError
                    errors={
                      createForm.formState.errors.baseUrl
                        ? [createForm.formState.errors.baseUrl]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("aiAdapter")}</FieldLabel>
                  <Select
                    value={createForm.watch("aiAdapter")}
                    onValueChange={(v) =>
                      createForm.setValue(
                        "aiAdapter",
                        v as (typeof AI_ADAPTER_OPTIONS)[number],
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_ADAPTER_OPTIONS.map((pt) => (
                        <SelectItem key={pt} value={pt}>
                          {pt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={createForm.watch("enabled")}
                      onCheckedChange={(v) => createForm.setValue("enabled", v)}
                      id="cp-enabled"
                    />
                    <FieldLabel htmlFor="cp-enabled">{t("enabled")}</FieldLabel>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="cp-desc">
                    {t("descriptionLabel")}
                  </FieldLabel>
                  <Input id="cp-desc" {...createForm.register("description")} />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="create-provider-form" disabled={saving}>
              {saving ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editItem}
        onOpenChange={(open) => {
          if (!open) setEditItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editProvider")}</DialogTitle>
            <DialogDescription>{t("editProviderDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {editItem && (
              <form
                id="edit-provider-form"
                onSubmit={updateForm.handleSubmit(handleUpdate)}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="ep-name">{t("name")}</FieldLabel>
                    <Input
                      id="ep-name"
                      aria-invalid={!!updateForm.formState.errors.name}
                      {...updateForm.register("name")}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.name
                          ? [updateForm.formState.errors.name]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ep-baseUrl">{t("baseUrl")}</FieldLabel>
                    <Input
                      id="ep-baseUrl"
                      aria-invalid={!!updateForm.formState.errors.baseUrl}
                      {...updateForm.register("baseUrl")}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.baseUrl
                          ? [updateForm.formState.errors.baseUrl]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("aiAdapter")}</FieldLabel>
                    <Select
                      value={updateForm.watch("aiAdapter") ?? ""}
                      onValueChange={(v) =>
                        updateForm.setValue(
                          "aiAdapter",
                          v as (typeof AI_ADAPTER_OPTIONS)[number],
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_ADAPTER_OPTIONS.map((pt) => (
                          <SelectItem key={pt} value={pt}>
                            {pt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={updateForm.watch("enabled") ?? false}
                        onCheckedChange={(v) =>
                          updateForm.setValue("enabled", v)
                        }
                        id="ep-enabled"
                      />
                      <FieldLabel htmlFor="ep-enabled">
                        {t("enabled")}
                      </FieldLabel>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ep-desc">
                      {t("descriptionLabel")}
                    </FieldLabel>
                    <Input
                      id="ep-desc"
                      {...updateForm.register("description")}
                    />
                  </Field>
                </FieldGroup>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="edit-provider-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteProvider")}</DialogTitle>
            <DialogDescription>
              {t("deleteProviderConfirmation", {
                name: deleteItem?.name ?? "",
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
