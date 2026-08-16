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
  DropdownMenuItem,
  Field,
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
import { KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { KeyTable } from "./key-table";

const createSchema = z.object({
  providerIds: z.string().array().min(1, "Select at least one provider."),
  name: z.string().min(1),
  balance: z.coerce.number().optional(),
  currency: z.string().optional(),
  concurrencyLimit: z.coerce.number().int().min(0).optional(),
  status: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  providerIds: z
    .string()
    .array()
    .min(1, "Select at least one provider.")
    .optional(),
  balance: z.coerce.number().optional().optional(),
  currency: z.string().optional(),
  concurrencyLimit: z.coerce.number().int().min(0).optional(),
  status: z.string().optional(),
});

const CURRENCIES = ["CNY", "USD"] as const;

interface AiAccount {
  id: string;
  providerIds: string[];
  name: string;
  balance: number;
  currency: string;
  concurrencyLimit: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function AccountTable() {
  const t = useTranslations("AiSettings");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<AiAccount | null>(null);
  const [deleteItem, setDeleteItem] = useState<AiAccount | null>(null);
  const [keyItem, setKeyItem] = useState<AiAccount | null>(null);
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
    items: accounts,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<AiAccount>({
    queryKey: ["ai-accounts", { search: debouncedSearch || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.ai.accounts.$get)({
        query: { limit, offset, search: debouncedSearch || undefined },
      });
      const data = await res.json();
      return { items: data.accounts, total: data.total };
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
      const body = createSchema.parse(createForm.getValues());
      const payload = { ...body, balance: body.balance ?? 0 };
      await withApiFeedback(appClient.api.ai.accounts.$post)({
        json: payload,
      });
      setCreateOpen(false);
      createForm.reset();
      refresh();
      toast.success(t("created"));
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  }

  function openEdit(a: AiAccount) {
    updateForm.reset(a);
    setEditItem(a);
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    try {
      const rawBody = updateForm.getValues() as Record<string, unknown>;
      const payload = updateSchema.parse(
        Object.fromEntries(
          Object.entries(rawBody).filter(
            ([, v]) => v !== undefined && v !== "",
          ),
        ),
      );
      await withApiFeedback(appClient.api.ai.accounts[":id"].$put)({
        param: { id: editItem.id },
        json: payload,
      });
      setEditItem(null);
      updateForm.reset();
      refresh();
      toast.success(t("updated"));
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.ai.accounts[":id"].$delete)({
        param: { id: deleteItem.id },
      });
      setDeleteItem(null);
      refresh();
      toast.success(t("deleted"));
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  }

  function providerName(id: string) {
    return providers.find((p) => p.id === id)?.name ?? id;
  }

  function providerNames(ids: string[]) {
    return ids.map(providerName).join(", ");
  }

  const createForm = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: {
      providerIds: [],
      name: "",
      balance: undefined,
      currency: "USD",
      concurrencyLimit: 1,
      status: "active",
    },
  });

  const updateForm = useForm({
    resolver: zodResolver(updateSchema),
  });

  const currencySelect = (
    value: string | undefined,
    onChange: (value: string) => void,
  ) => (
    <Select
      value={value ?? ""}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((currency) => (
          <SelectItem key={currency} value={currency}>
            {currency}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const providerOptions = useMemo(
    () => providers.map((p) => ({ label: p.name, value: p.id })),
    [providers],
  );

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={accounts.length === 0}
        emptyMessage={t("noAccounts")}
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
            <TableHead>{t("provider")}</TableHead>
            <TableHead>{t("balance")}</TableHead>
            <TableHead>{t("currency")}</TableHead>
            <TableHead align="center">{t("concurrencyLimit")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.name}</TableCell>
              <TableCell>{providerNames(a.providerIds)}</TableCell>
              <TableCell>{a.balance}</TableCell>
              <TableCell>{a.currency}</TableCell>
              <TableCell align="center">{a.concurrencyLimit}</TableCell>
              <TableCell>{a.status}</TableCell>
              <TableCell>{formatDate(a.createdAt)}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <>
                    <DropdownMenuItem onClick={() => setKeyItem(a)}>
                      <KeyRound />
                      {t("manageKeys")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(a)}>
                      <Pencil />
                      {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteItem(a)}
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
                    aria-label={t("manageKeys")}
                    tooltip={t("manageKeys")}
                    onClick={() => setKeyItem(a)}
                  >
                    <KeyRound />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => openEdit(a)}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDeleteItem(a)}
                  >
                    <Trash2 />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog
        open={!!keyItem}
        onOpenChange={(open) => {
          if (!open) setKeyItem(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {t("manageKeysFor", { name: keyItem?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>{keyItem && <KeyTable account={keyItem} />}</DialogBody>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createAccount")}</DialogTitle>
            <DialogDescription>{t("createAccountDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              id="create-acct-form"
              onSubmit={createForm.handleSubmit(handleCreate)}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel required>{t("providers")}</FieldLabel>
                  <MultiSelect
                    options={providerOptions}
                    value={createForm.watch("providerIds") ?? []}
                    onChange={(ids) =>
                      createForm.setValue("providerIds", ids, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    placeholder={t("selectProviders")}
                  />
                  <FieldError
                    errors={
                      createForm.formState.errors.providerIds
                        ? [createForm.formState.errors.providerIds]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ca-name" required>
                    {t("name")}
                  </FieldLabel>
                  <Input id="ca-name" {...createForm.register("name")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ca-balance">{t("balance")}</FieldLabel>
                  <Input
                    id="ca-balance"
                    type="number"
                    step="0.01"
                    {...createForm.register("balance")}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("currency")}</FieldLabel>
                  {currencySelect(createForm.watch("currency"), (value) =>
                    createForm.setValue("currency", value),
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="ca-concurrency">
                    {t("concurrencyLimit")}
                  </FieldLabel>
                  <Input
                    id="ca-concurrency"
                    type="number"
                    {...createForm.register("concurrencyLimit")}
                  />
                </Field>
                <Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={createForm.watch("status") !== "inactive"}
                      onCheckedChange={(checked) =>
                        createForm.setValue(
                          "status",
                          checked ? "active" : "inactive",
                        )
                      }
                      id="ca-status"
                    />
                    <FieldLabel htmlFor="ca-status">{t("enabled")}</FieldLabel>
                  </div>
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="create-acct-form" disabled={saving}>
              {saving ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editItem}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editAccount")}</DialogTitle>
            <DialogDescription>{t("editAccountDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {editItem && (
              <form
                id="edit-acct-form"
                onSubmit={updateForm.handleSubmit(handleUpdate)}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel>{t("providers")}</FieldLabel>
                    <MultiSelect
                      options={providerOptions}
                      value={updateForm.watch("providerIds") ?? []}
                      onChange={(ids) =>
                        updateForm.setValue("providerIds", ids, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      placeholder={t("selectProviders")}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.providerIds
                          ? [updateForm.formState.errors.providerIds]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ea-name">{t("name")}</FieldLabel>
                    <Input id="ea-name" {...updateForm.register("name")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ea-balance">{t("balance")}</FieldLabel>
                    <Input
                      id="ea-balance"
                      type="number"
                      step="0.01"
                      {...updateForm.register("balance")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("currency")}</FieldLabel>
                    {currencySelect(updateForm.watch("currency"), (value) =>
                      updateForm.setValue("currency", value),
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ea-concurrency">
                      {t("concurrencyLimit")}
                    </FieldLabel>
                    <Input
                      id="ea-concurrency"
                      type="number"
                      {...updateForm.register("concurrencyLimit")}
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={updateForm.watch("status") !== "inactive"}
                        onCheckedChange={(checked) =>
                          updateForm.setValue(
                            "status",
                            checked ? "active" : "inactive",
                          )
                        }
                        id="ea-status"
                      />
                      <FieldLabel htmlFor="ea-status">
                        {t("enabled")}
                      </FieldLabel>
                    </div>
                  </Field>
                </FieldGroup>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="edit-acct-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog
        open={!!deleteItem}
        onOpenChange={(o) => {
          if (!o) setDeleteItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteAccount")}</DialogTitle>
            <DialogDescription>
              {t("deleteAccountConfirmation", { name: deleteItem?.name ?? "" })}
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
