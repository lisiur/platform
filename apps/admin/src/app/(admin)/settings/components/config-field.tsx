"use client";

import { useTranslations } from "next-intl";
import { type Control, Controller } from "react-hook-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  sortOrder: number;
}

interface ConfigFieldProps {
  item: ConfigItem;
  control: Control<Record<string, string>>;
}

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
        render={({ field }) => {
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
                  className="h-4 w-4 rounded border-gray-300"
                />
                <FieldLabel htmlFor={item.key} className="font-normal">
                  {item.description ? tr(item.description) : t("enable")}
                </FieldLabel>
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
                </div>
              );
            }
            return (
              <Textarea
                id={item.key}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
                rows={4}
                placeholder={t("jsonPlaceholder")}
              />
            );
          }

          return (
            <Input
              id={item.key}
              type={
                item.isSecret
                  ? "password"
                  : item.type === "number"
                    ? "number"
                    : "text"
              }
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          );
        }}
      />
    </Field>
  );
}
