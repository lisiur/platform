"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfigFieldLabel } from "./config-field-label";

type JsonSchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  items?: { type?: string };
};

type JsonObjectSchema = {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

interface JsonSchemaFieldProps {
  id: string;
  value: string;
  schema: unknown;
  onChange: (value: string) => void;
}

export function isSupportedJsonSchema(
  schema: unknown,
): schema is JsonObjectSchema {
  if (!schema || typeof schema !== "object") return false;
  const typed = schema as JsonObjectSchema;
  if (typed.type !== "object" || !typed.properties) return false;
  return Object.values(typed.properties).every((property) => {
    if (["boolean", "string", "number"].includes(property.type ?? "")) {
      return true;
    }
    return property.type === "array" && property.items?.type === "string";
  });
}

function parseJsonObject(
  value: string,
  schema: JsonObjectSchema,
): Record<string, unknown> {
  let parsed: Record<string, unknown> = {};
  try {
    const candidate = JSON.parse(value || "{}");
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (parsed[key] === undefined && property.default !== undefined) {
      parsed[key] = property.default;
    }
  }
  return parsed;
}

export function JsonSchemaField({
  id,
  value,
  schema,
  onChange,
}: JsonSchemaFieldProps) {
  const t = useTranslations("Settings");
  const tr = useTranslations("Remote");
  const [arrayInputs, setArrayInputs] = useState<Record<string, string>>({});

  if (!isSupportedJsonSchema(schema)) return null;

  const objectValue = parseJsonObject(value, schema);

  const updateField = (key: string, nextValue: unknown) => {
    onChange(JSON.stringify({ ...objectValue, [key]: nextValue }));
  };

  return (
    <div id={id} className="space-y-4">
      {Object.entries(schema.properties ?? {}).map(([key, property]) => {
        const label = property.title ? tr(property.title) : key;
        const description = property.description
          ? tr(property.description)
          : null;

        if (property.type === "boolean") {
          const checkboxLabel = description ?? label;
          return (
            <Field key={key} className="gap-2">
              {description && (
                <ConfigFieldLabel
                  label={label}
                  className="font-normal text-sm"
                />
              )}
              <Field orientation="horizontal" className="gap-2">
                <input
                  type="checkbox"
                  id={`${id}-${key}`}
                  checked={Boolean(objectValue[key])}
                  onChange={(event) => updateField(key, event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <FieldLabel
                  htmlFor={`${id}-${key}`}
                  className="font-normal text-sm"
                >
                  {checkboxLabel}
                </FieldLabel>
              </Field>
            </Field>
          );
        }

        if (property.type === "array" && property.items?.type === "string") {
          const values = Array.isArray(objectValue[key])
            ? (objectValue[key] as unknown[]).filter(
                (item): item is string => typeof item === "string",
              )
            : [];
          const pendingValue = arrayInputs[key] ?? "";
          const commitPendingValue = () => {
            const nextItems = pendingValue
              .split(/[\n,]+/)
              .map((item) => item.trim())
              .filter(Boolean);
            if (nextItems.length === 0) return;

            const mergedValues = [...values];
            for (const nextItem of nextItems) {
              if (!mergedValues.includes(nextItem)) {
                mergedValues.push(nextItem);
              }
            }
            updateField(key, mergedValues);
            setArrayInputs((state) => ({ ...state, [key]: "" }));
          };

          return (
            <Field key={key}>
              <ConfigFieldLabel
                label={label}
                description={description}
                className="font-normal text-sm"
              />
              <div className="space-y-2">
                {values.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-md border px-3"
                  >
                    <span className="flex-1 text-sm">{item}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateField(
                          key,
                          values.filter((valueItem) => valueItem !== item),
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={pendingValue}
                    onChange={(event) =>
                      setArrayInputs((state) => ({
                        ...state,
                        [key]: event.target.value,
                      }))
                    }
                    onBlur={commitPendingValue}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitPendingValue();
                      }
                    }}
                    placeholder={t("arrayItemPlaceholder")}
                  />
                  <Button type="button" onClick={commitPendingValue}>
                    {t("addArrayItem")}
                  </Button>
                </div>
              </div>
            </Field>
          );
        }

        return (
          <Field key={key}>
            <ConfigFieldLabel
              label={label}
              description={description}
              className="font-normal text-sm"
            />
            <Input
              type={property.type === "number" ? "number" : "text"}
              value={String(objectValue[key] ?? "")}
              onChange={(event) =>
                updateField(
                  key,
                  property.type === "number"
                    ? Number(event.target.value)
                    : event.target.value,
                )
              }
            />
          </Field>
        );
      })}
    </div>
  );
}
