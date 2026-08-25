"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
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
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, type Ref, useImperativeHandle } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import type { RealAccountDto } from "@/hooks/use-real-accounts";

const REAL_TYPES = ["asset", "liability"] as const;

type MetaEntry = { key: string; value: string; raw?: unknown };

export type RealAccountFormInput = {
  name: string;
  type: (typeof REAL_TYPES)[number];
  icon: string;
  metaEntries: MetaEntry[];
};

export interface RealAccountFormRef {
  validate: () => Promise<RealAccountFormInput>;
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

export function realAccountToFormValues(
  real: RealAccountDto,
): RealAccountFormInput {
  return {
    name: real.name,
    type: real.type,
    icon: real.icon ?? "",
    metaEntries: metaToEntries(real.meta),
  };
}

interface RealAccountFormProps {
  ref: Ref<RealAccountFormRef>;
  defaultValues: RealAccountFormInput;
  /** Type is immutable once pockets may link to the master. */
  typeDisabled?: boolean;
}

export const RealAccountForm = forwardRef<
  RealAccountFormRef,
  RealAccountFormProps
>(function RealAccountForm({ defaultValues, typeDisabled = false }, ref) {
  const t = useTranslations("RealAccounts");

  const realAccountFormSchema = z.object({
    name: z.string().min(1, t("nameRequired")),
    type: z.enum(REAL_TYPES),
    icon: z.string().max(100),
    metaEntries: z.array(
      z.object({
        key: z.string().min(1, t("metaKeyRequired")),
        value: z.string(),
        raw: z.unknown().optional(),
      }),
    ),
  });

  const form = useForm<RealAccountFormInput>({
    resolver: zodResolver(realAccountFormSchema),
    defaultValues,
  });

  const metaArray = useFieldArray({
    control: form.control,
    name: "metaEntries",
  });

  useImperativeHandle(ref, () => ({
    validate: () =>
      new Promise<RealAccountFormInput>((resolve, reject) => {
        form.handleSubmit(resolve, reject)();
      }),
  }));

  const typeItems = REAL_TYPES.map((type) => ({
    value: type,
    label: t(`types.${type}`),
  }));

  return (
    <FieldGroup>
      <Field data-invalid={!!form.formState.errors.name}>
        <FieldLabel htmlFor="real-account-name" required>
          {t("name")}
        </FieldLabel>
        <Input
          id="real-account-name"
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
        <FieldLabel htmlFor="real-account-icon">{t("icon")}</FieldLabel>
        <Input
          id="real-account-icon"
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
        <FieldLabel htmlFor="real-account-type" required>
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
                id="real-account-type"
                aria-invalid={!!fieldState.error}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REAL_TYPES.map((type) => (
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
        <p className="text-sm text-muted-foreground">{t("metaDescription")}</p>
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
});
