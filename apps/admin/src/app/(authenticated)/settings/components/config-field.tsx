"use client";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { type Control, Controller } from "react-hook-form";
import { ConfigFieldLabel } from "./config-field-label";
import { isSupportedJsonSchema, JsonSchemaField } from "./json-schema-field";

interface ConfigItem {
  id: string;
  group: string;
  key: string;
  value: string;
  type: string;
  label: string;
  description?: string | null;
  schema?: unknown | null;
  isSecret: boolean;
  mask?: string | null;
  sortOrder: number;
}

/** A `select` config field's `schema` is `{ options: [{ value, label }] }`. */
interface SelectConfigSchema {
  options: Array<{ value: string; label: string }>;
}

function isSelectConfigSchema(schema: unknown): schema is SelectConfigSchema {
  if (!schema || typeof schema !== "object") return false;
  const opts = (schema as { options?: unknown }).options;
  return (
    Array.isArray(opts) &&
    opts.every(
      (o) =>
        o &&
        typeof o === "object" &&
        typeof (o as { value?: unknown }).value === "string",
    )
  );
}

interface ConfigFieldProps {
  item: ConfigItem;
  control: Control<Record<string, string>>;
}

const SESSION_MAX_AGE_PRESETS = [
  { labelKey: "oneDay", seconds: 86_400 },
  { labelKey: "sevenDays", seconds: 604_800 },
  { labelKey: "thirtyDays", seconds: 2_592_000 },
  { labelKey: "oneYear", seconds: 31_536_000 },
  { labelKey: "forever", seconds: 2_147_483_647 },
];

export function ConfigField({ item, control }: ConfigFieldProps) {
  const t = useTranslations("Settings");
  const tr = useTranslations("Remote");

  return (
    <Field>
      <ConfigFieldLabel
        htmlFor={item.key}
        label={tr(item.label)}
        description={
          item.description && item.type !== "boolean"
            ? tr(item.description)
            : undefined
        }
      />
      <Controller
        name={item.key}
        control={control}
        render={({ field, fieldState }) => {
          const fieldError = fieldState.error ? (
            <FieldError errors={[fieldState.error]} />
          ) : null;

          if (item.type === "boolean") {
            return (
              <Field orientation="horizontal" className="gap-2">
                <input
                  type="checkbox"
                  id={item.key}
                  checked={field.value === "true"}
                  onChange={(e) =>
                    field.onChange(e.target.checked ? "true" : "false")
                  }
                  aria-invalid={!!fieldState.error}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <FieldLabel htmlFor={item.key} className="font-normal">
                  {item.description ? tr(item.description) : t("enable")}
                </FieldLabel>
                {fieldError}
              </Field>
            );
          }

          if (item.type === "json") {
            if (item.schema && isSupportedJsonSchema(item.schema)) {
              return (
                <div className="ml-3 border-l pl-4">
                  <JsonSchemaField
                    id={item.key}
                    value={field.value ?? ""}
                    schema={item.schema}
                    onChange={field.onChange}
                  />
                  {fieldError}
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <Textarea
                  id={item.key}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  rows={4}
                  aria-invalid={!!fieldState.error}
                  placeholder={t("jsonPlaceholder")}
                />
                {fieldError}
              </div>
            );
          }

          if (item.type === "select" && isSelectConfigSchema(item.schema)) {
            return (
              <>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    field.onChange(value);
                    field.onBlur();
                  }}
                >
                  <SelectTrigger id={item.key} className="w-full">
                    <SelectValue placeholder={t("selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {item.schema.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {tr(opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError}
              </>
            );
          }

          return (
            <div className="space-y-2">
              <Input
                id={item.key}
                type={item.type === "number" ? "number" : "text"}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
                aria-invalid={!!fieldState.error}
              />
              {item.group === "auth" && item.key === "session.maxAge" ? (
                <div className="flex flex-wrap gap-2">
                  {SESSION_MAX_AGE_PRESETS.map((preset) => {
                    const isActive = field.value === String(preset.seconds);

                    return (
                      <Button
                        key={preset.labelKey}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        aria-pressed={isActive}
                        onClick={() => {
                          field.onChange(String(preset.seconds));
                          field.onBlur();
                        }}
                      >
                        {t(`sessionMaxAgePresets.${preset.labelKey}`)}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
              {fieldError}
            </div>
          );
        }}
      />
    </Field>
  );
}
