"use client";

import { useTranslations } from "next-intl";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  isRecord,
  isSupportedObjectSchema,
  type JsonObjectSchema,
} from "./notification-form-utils";

interface ChannelConfigFieldsProps {
  schema: unknown;
  value: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
}

function getObjectValue(value: Record<string, unknown> | null) {
  return value ?? {};
}

function getLabel(key: string, schema: JsonObjectSchema) {
  const property = schema.properties?.[key];
  return typeof property?.title === "string" ? property.title : key;
}

export function ChannelConfigFields({
  schema,
  value,
  onChange,
}: ChannelConfigFieldsProps) {
  const t = useTranslations("Notifications");

  if (!isSupportedObjectSchema(schema)) {
    return (
      <p className="text-muted-foreground text-sm">{t("channels.noConfig")}</p>
    );
  }

  const objectValue = getObjectValue(value);
  const required = new Set(schema.required ?? []);

  function updateField(key: string, nextValue: unknown) {
    onChange({ ...objectValue, [key]: nextValue });
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div>
        <p className="font-medium text-sm">{t("channels.config")}</p>
        <p className="text-muted-foreground text-xs">
          {t("channels.configDescription")}
        </p>
      </div>
      {Object.entries(schema.properties ?? {}).map(([key, property]) => {
        const label = getLabel(key, schema);
        const requiredMarker = required.has(key) ? " *" : "";
        const description = isRecord(property)
          ? property.description
          : undefined;

        if (property.type === "boolean") {
          return (
            <Field
              key={key}
              orientation="horizontal"
              className="justify-between"
            >
              <div className="space-y-1">
                <FieldLabel htmlFor={`channel-config-${key}`}>
                  {label}
                  {requiredMarker}
                </FieldLabel>
                {typeof description === "string" && (
                  <FieldDescription>{description}</FieldDescription>
                )}
              </div>
              <Switch
                id={`channel-config-${key}`}
                checked={Boolean(objectValue[key])}
                onCheckedChange={(checked) => updateField(key, checked)}
              />
            </Field>
          );
        }

        return (
          <Field key={key}>
            <FieldLabel htmlFor={`channel-config-${key}`}>
              {label}
              {requiredMarker}
            </FieldLabel>
            <Input
              id={`channel-config-${key}`}
              type={
                property.type === "number"
                  ? "number"
                  : property.format === "password"
                    ? "password"
                    : "text"
              }
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
            {typeof description === "string" && (
              <FieldDescription>{description}</FieldDescription>
            )}
          </Field>
        );
      })}
    </div>
  );
}
