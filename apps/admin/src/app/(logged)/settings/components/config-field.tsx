"use client";

import { useTranslations } from "next-intl";
import { type Control, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfigItem {
  id: string;
  group: string;
  key: string;
  value: string;
  type: string;
  label: string;
  description?: string | null;
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
    <div className="space-y-2">
      <Label htmlFor={item.key}>{tr(item.label)}</Label>
      <Controller
        name={item.key}
        control={control}
        render={({ field }) => {
          if (item.type === "boolean") {
            return (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={item.key}
                  checked={field.value === "true"}
                  onChange={(e) =>
                    field.onChange(e.target.checked ? "true" : "false")
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor={item.key} className="font-normal">
                  {item.description ? tr(item.description) : t("enable")}
                </Label>
              </div>
            );
          }

          if (item.type === "json") {
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
      {item.description && item.type !== "boolean" && (
        <p className="text-sm text-muted-foreground">{tr(item.description)}</p>
      )}
    </div>
  );
}
