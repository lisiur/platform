"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  FieldDescription,
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
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, type Ref, useImperativeHandle } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import type { AccountRow } from "./accounts-table";

/** Types a user can create; equity is system-managed. */
const ACCOUNT_TYPES = ["asset", "liability", "income", "expense"] as const;

/** Superset kept valid for the form so system accounts still parse. */
const ALL_TYPES = [...ACCOUNT_TYPES, "equity"] as const;

type MetaEntry = { key: string; value: string; raw?: unknown };

export type AccountFormInput = {
  name: string;
  type: (typeof ALL_TYPES)[number];
  icon: string;
  metaEntries: MetaEntry[];
};

export interface AccountFormRef {
  validate: () => Promise<AccountFormInput>;
}

function metaValueToString(value: unknown): string {
  return value !== null && typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
}

export function metaToEntries(
  meta: Record<string, unknown> | null | undefined,
): MetaEntry[] {
  if (!meta) return [];
  return Object.entries(meta).map(([key, value]) => ({
    key,
    value: metaValueToString(value),
    raw: value,
  }));
}

export function buildMeta(
  entries: MetaEntry[],
): Record<string, unknown> | null {
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

export function accountToFormValues(account: AccountRow): AccountFormInput {
  return {
    // Seeded accounts start empty (the localized label is the placeholder);
    // a typed name becomes a custom override above the label.
    name: account.name ?? "",
    type: account.type,
    icon: account.icon ?? "",
    metaEntries: metaToEntries(account.meta),
  };
}

interface AccountFormProps {
  ref: Ref<AccountFormRef>;
  defaultValues: AccountFormInput;
  /** Type select is disabled when editing (immutable) or locked by a parent. */
  typeDisabled?: boolean;
  /** Name may be left empty (keep the localized label) for seeded accounts. */
  nameOptional?: boolean;
  /** Placeholder for the name input (the account's localized label). */
  namePlaceholder?: string;
}

export const AccountForm = forwardRef<AccountFormRef, AccountFormProps>(
  function AccountForm(
    {
      defaultValues,
      typeDisabled = false,
      nameOptional = false,
      namePlaceholder,
    },
    ref,
  ) {
    const t = useTranslations("Accounts");

    const accountFormSchema = z.object({
      name: nameOptional ? z.string().max(100) : z.string().min(1),
      type: z.enum(ALL_TYPES),
      icon: z.string().max(100),
      metaEntries: z.array(
        z.object({
          key: z.string().min(1, t("metaKeyRequired")),
          value: z.string(),
          raw: z.unknown().optional(),
        }),
      ),
    });

    const form = useForm<AccountFormInput>({
      resolver: zodResolver(accountFormSchema),
      defaultValues,
    });

    const metaArray = useFieldArray({
      control: form.control,
      name: "metaEntries",
    });

    useImperativeHandle(ref, () => ({
      validate: () =>
        new Promise<AccountFormInput>((resolve, reject) => {
          form.handleSubmit(resolve, reject)();
        }),
    }));

    const typeItems = ACCOUNT_TYPES.map((type) => ({
      value: type,
      label: t(`types.${type}`),
    }));

    return (
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="account-name" required={!nameOptional}>
            {t("name")}
          </FieldLabel>
          <Input
            id="account-name"
            aria-invalid={!!form.formState.errors.name}
            {...form.register("name")}
            placeholder={namePlaceholder ?? t("namePlaceholder")}
          />
          {nameOptional && (
            <FieldDescription>{t("nameOptionalHint")}</FieldDescription>
          )}
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
                disabled={typeDisabled}
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
                      <FieldError errors={keyError ? [keyError] : undefined} />
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
    );
  },
);
