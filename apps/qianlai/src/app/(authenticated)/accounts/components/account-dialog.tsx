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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";
import type { AccountRow } from "./accounts-table";

const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

type MetaEntry = { key: string; value: string; raw?: unknown };

type AccountFormData = {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  sortOrder: number;
  icon: string;
  metaEntries: MetaEntry[];
};

function metaValueToString(value: unknown): string {
  return value !== null && typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
}

function metaToEntries(
  meta: Record<string, unknown> | null | undefined,
): MetaEntry[] {
  if (!meta) return [];
  return Object.entries(meta).map(([key, value]) => ({
    key,
    value: metaValueToString(value),
    raw: value,
  }));
}

function buildMeta(entries: MetaEntry[]): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    meta[key] =
      entry.raw !== undefined && metaValueToString(entry.raw) === entry.value
        ? entry.raw
        : entry.value;
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  account?: AccountRow;
}

export function AccountDialog({
  open,
  onOpenChange,
  ledgerId,
  account,
}: AccountDialogProps) {
  const t = useTranslations("Accounts");
  const queryClient = useQueryClient();
  const isEdit = !!account;

  const accountFormSchema = z.object({
    name: z.string().min(1),
    type: z.enum(ACCOUNT_TYPES),
    sortOrder: z.number().int(),
    icon: z.string().max(100),
    metaEntries: z.array(
      z.object({
        key: z.string().min(1, t("metaKeyRequired")),
        value: z.string(),
        raw: z.unknown().optional(),
      }),
    ),
  });

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: account?.name ?? "",
      type: account?.type ?? "asset",
      sortOrder: account?.sortOrder ?? 0,
      icon: account?.icon ?? "",
      metaEntries: metaToEntries(account?.meta),
    },
  });

  const metaArray = useFieldArray({
    control: form.control,
    name: "metaEntries",
  });

  const typeItems = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: t(`types.${type}`),
  }));

  const mutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      const meta = buildMeta(data.metaEntries);
      const icon = data.icon.trim() || null;
      if (isEdit) {
        await withApiFeedback(
          appClient.api.bookkeeping.ledgers[":ledgerId"].accounts[":id"].$patch,
        )({
          param: { ledgerId, id: account.id },
          json: { ...data, icon, meta },
        });
      } else {
        await withApiFeedback(
          appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$post,
        )({
          param: { ledgerId },
          json: {
            ...data,
            parentId: null,
            icon,
            ...(meta ? { meta } : {}),
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "accounts", ledgerId],
      });
      toast.success(isEdit ? t("updateSuccess") : t("createSuccess"));
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
          <DialogTitle>{isEdit ? t("edit") : t("create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="account-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="account-name" required>
                  {t("name")}
                </FieldLabel>
                <Input
                  id="account-name"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                  placeholder={t("namePlaceholder")}
                />
                <FieldError
                  errors={
                    form.formState.errors.name
                      ? [form.formState.errors.name]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.icon}>
                <FieldLabel htmlFor="account-icon">{t("icon")}</FieldLabel>
                <Input
                  id="account-icon"
                  aria-invalid={!!form.formState.errors.icon}
                  {...form.register("icon")}
                  placeholder={t("iconPlaceholder")}
                />
                <FieldError
                  errors={
                    form.formState.errors.icon
                      ? [form.formState.errors.icon]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.sortOrder}>
                <FieldLabel htmlFor="account-sort-order">
                  {t("sortOrder")}
                </FieldLabel>
                <Input
                  id="account-sort-order"
                  type="number"
                  step="1"
                  aria-invalid={!!form.formState.errors.sortOrder}
                  {...form.register("sortOrder", { valueAsNumber: true })}
                />
                <FieldError
                  errors={
                    form.formState.errors.sortOrder
                      ? [form.formState.errors.sortOrder]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.type}>
                <FieldLabel htmlFor="account-type" required>
                  {t("type")}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field, fieldState }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      items={typeItems}
                    >
                      <SelectTrigger
                        id="account-type"
                        aria-invalid={!!fieldState.error}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`types.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError
                  errors={
                    form.formState.errors.type
                      ? [form.formState.errors.type]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t("meta")}</FieldLabel>
                <p className="text-sm text-muted-foreground">
                  {t("metaDescription")}
                </p>
                <div className="space-y-2">
                  {metaArray.fields.map((field, index) => {
                    const keyError = form.getFieldState(
                      `metaEntries.${index}.key`,
                    ).error;
                    return (
                      <div key={field.id} className="flex items-start gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-2">
                          <div>
                            <Input
                              aria-label={t("metaKey")}
                              aria-invalid={!!keyError}
                              placeholder={t("metaKey")}
                              {...form.register(`metaEntries.${index}.key`)}
                            />
                            <FieldError
                              errors={keyError ? [keyError] : undefined}
                            />
                          </div>
                          <Input
                            aria-label={t("metaValue")}
                            placeholder={t("metaValue")}
                            {...form.register(`metaEntries.${index}.value`)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("removeMeta")}
                          onClick={() => metaArray.remove(index)}
                        >
                          <X />
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => metaArray.append({ key: "", value: "" })}
                  >
                    {t("addMeta")}
                  </Button>
                </div>
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
            form="account-dialog-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? t("saving")
              : isEdit
                ? t("save")
                : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
