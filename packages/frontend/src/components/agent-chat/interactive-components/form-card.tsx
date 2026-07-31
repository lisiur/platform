"use client";

import {
  Badge,
  Button,
  Checkbox,
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
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ToolPart } from "../tool-card";

interface FormCardProps {
  part: ToolPart;
  submitToolResult?: (
    toolCallId: string,
    output: unknown,
    toolName?: string,
  ) => void;
}

type FormFieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "textarea"
  | "select"
  | "boolean"
  | "date";

type FieldValue = string | boolean;

interface FormOption {
  value: string;
  label: string;
}

interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: FormOption[];
  defaultValue?: FieldValue;
}

interface FormInput {
  operationId?: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: FormField[];
}

const FIELD_TYPES = new Set<FormFieldType>([
  "text",
  "email",
  "password",
  "number",
  "textarea",
  "select",
  "boolean",
  "date",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFieldValue(value: unknown, type: FormFieldType): FieldValue {
  if (type === "boolean") return value === true;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

function parseFormInput(input: unknown): FormInput | null {
  if (!isRecord(input)) return null;
  const title = input.title;
  const fields = input.fields;
  if (typeof title !== "string" || !Array.isArray(fields)) return null;

  const parsedFields = fields.flatMap((field): FormField[] => {
    if (!isRecord(field)) return [];
    const name = field.name;
    const label = field.label;
    const type = field.type;
    if (
      typeof name !== "string" ||
      typeof label !== "string" ||
      typeof type !== "string" ||
      !FIELD_TYPES.has(type as FormFieldType)
    ) {
      return [];
    }

    const fieldType = type as FormFieldType;
    const options = Array.isArray(field.options)
      ? field.options.flatMap((option): FormOption[] => {
          if (!isRecord(option)) return [];
          if (
            typeof option.value !== "string" ||
            typeof option.label !== "string"
          ) {
            return [];
          }
          return [{ value: option.value, label: option.label }];
        })
      : undefined;

    if (fieldType === "select" && (!options || options.length === 0)) return [];

    return [
      {
        name,
        label,
        type: fieldType,
        required: field.required === true,
        description:
          typeof field.description === "string" ? field.description : undefined,
        placeholder:
          typeof field.placeholder === "string" ? field.placeholder : undefined,
        options,
        defaultValue: parseFieldValue(field.defaultValue, fieldType),
      },
    ];
  });

  if (parsedFields.length === 0) return null;
  return {
    operationId:
      typeof input.operationId === "string" ? input.operationId : undefined,
    title,
    description:
      typeof input.description === "string" ? input.description : undefined,
    submitLabel:
      typeof input.submitLabel === "string" ? input.submitLabel : undefined,
    fields: parsedFields,
  };
}

function valuesFromOutput(output: unknown): Record<string, unknown> {
  if (!isRecord(output) || !isRecord(output.values)) return {};
  return output.values;
}

function initialValues(form: FormInput): Record<string, FieldValue> {
  return Object.fromEntries(
    form.fields.map((field) => [
      field.name,
      field.defaultValue ?? (field.type === "boolean" ? false : ""),
    ]),
  );
}

function valuesForDisplay(
  form: FormInput,
  output: unknown,
): Record<string, FieldValue> {
  const submittedValues = valuesFromOutput(output);
  if (Object.keys(submittedValues).length === 0) return initialValues(form);
  return Object.fromEntries(
    form.fields.map((field) => [
      field.name,
      parseFieldValue(submittedValues[field.name], field.type),
    ]),
  );
}

export function FormCard({ part, submitToolResult }: FormCardProps) {
  const t = useTranslations("Agent");
  const input = useMemo(() => parseFormInput(part.input), [part.input]);
  const [lastInput, setLastInput] = useState<FormInput | null>(input);
  const [values, setValues] = useState<Record<string, FieldValue>>(
    input ? initialValues(input) : {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!input) return;
    setLastInput(input);
    setValues(initialValues(input));
    setErrors({});
  }, [input]);

  const form = input ?? lastInput;

  if (part.state === "input-streaming") {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
        {t("preparingForm")}
      </div>
    );
  }

  if (!form) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
        {t("invalidFormRequest")}
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
        {part.errorText ?? t("formSubmissionFailed")}
      </div>
    );
  }

  const currentForm = form;
  const submitted = part.state === "output-available";
  const locked =
    submitted || part.state !== "input-available" || !submitToolResult;
  const activeValues = submitted
    ? valuesForDisplay(currentForm, part.output)
    : values;

  function updateValue(name: string, value: FieldValue) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function buildOutputValues(): Record<string, unknown> | null {
    const nextErrors: Record<string, string> = {};
    const outputValues: Record<string, unknown> = {};

    for (const field of currentForm.fields) {
      const value = values[field.name];

      if (field.type === "boolean") {
        outputValues[field.name] = value === true;
        continue;
      }

      const textValue = String(value ?? "").trim();
      if (field.required && !textValue) {
        nextErrors[field.name] = t("requiredField");
        continue;
      }
      if (!textValue) continue;

      if (field.type === "number") {
        const numericValue = Number(textValue);
        if (!Number.isFinite(numericValue)) {
          nextErrors[field.name] = t("invalidNumber");
          continue;
        }
        outputValues[field.name] = numericValue;
      } else {
        outputValues[field.name] = textValue;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length > 0 ? null : outputValues;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !part.toolCallId ||
      !submitToolResult ||
      part.state !== "input-available"
    ) {
      return;
    }
    const outputValues = buildOutputValues();
    if (!outputValues) return;
    submitToolResult(
      part.toolCallId,
      { operationId: currentForm.operationId, values: outputValues },
      "render_form",
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border bg-background p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{currentForm.title}</p>
          {currentForm.description ? (
            <p className="mt-1 text-muted-foreground text-xs">
              {currentForm.description}
            </p>
          ) : null}
        </div>
        {submitted ? <Badge variant="secondary">{t("submitted")}</Badge> : null}
        {!submitted && !submitToolResult ? (
          <Badge variant="secondary">{t("unavailable")}</Badge>
        ) : null}
      </div>

      <FieldGroup className="gap-3">
        {currentForm.fields.map((field) => {
          const fieldId = `${part.toolCallId ?? "form"}-${field.name}`;
          const value = activeValues[field.name];
          const error = errors[field.name];

          return (
            <Field
              key={field.name}
              data-invalid={Boolean(error)}
              orientation={field.type === "boolean" ? "horizontal" : "vertical"}
            >
              {field.type === "boolean" ? (
                <Checkbox
                  id={fieldId}
                  checked={value === true}
                  disabled={locked}
                  onCheckedChange={(checked) =>
                    updateValue(field.name, checked === true)
                  }
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <FieldLabel htmlFor={fieldId}>
                  {field.label}
                  {field.required ? (
                    <span className="text-destructive">*</span>
                  ) : null}
                </FieldLabel>
                {field.description ? (
                  <FieldDescription>{field.description}</FieldDescription>
                ) : null}
                {field.type === "textarea" ? (
                  <Textarea
                    id={fieldId}
                    value={String(value ?? "")}
                    disabled={locked}
                    placeholder={field.placeholder}
                    aria-invalid={Boolean(error)}
                    onChange={(event) =>
                      updateValue(field.name, event.target.value)
                    }
                  />
                ) : field.type === "select" ? (
                  <Select
                    value={String(value ?? "")}
                    disabled={locked}
                    onValueChange={(nextValue) =>
                      updateValue(field.name, nextValue ?? "")
                    }
                  >
                    <SelectTrigger
                      id={fieldId}
                      className="w-full"
                      aria-invalid={Boolean(error)}
                    >
                      <SelectValue
                        placeholder={
                          field.placeholder ?? t("selectPlaceholder")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type !== "boolean" ? (
                  <Input
                    id={fieldId}
                    type={field.type}
                    value={String(value ?? "")}
                    disabled={locked}
                    placeholder={field.placeholder}
                    aria-invalid={Boolean(error)}
                    onChange={(event) =>
                      updateValue(field.name, event.target.value)
                    }
                  />
                ) : null}
                <FieldError>{error}</FieldError>
              </div>
            </Field>
          );
        })}
      </FieldGroup>

      {!locked ? (
        <Button type="submit" size="sm">
          {currentForm.submitLabel ?? t("continue")}
        </Button>
      ) : null}
    </form>
  );
}
