"use client";

import { Badge, Button, cn } from "@repo/ui";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { ToolPart } from "../tool-card";

interface ChoiceCardProps {
  part: ToolPart;
  submitToolResult?: (toolCallId: string, output: unknown) => void;
}

interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

interface ChoiceInput {
  prompt: string;
  options: ChoiceOption[];
  multiple: boolean;
}

function parseChoiceInput(input: unknown): ChoiceInput | null {
  if (typeof input !== "object" || input === null) return null;
  const prompt = (input as { prompt?: unknown }).prompt;
  const options = (input as { options?: unknown }).options;
  if (typeof prompt !== "string" || !Array.isArray(options)) return null;

  const parsedOptions = options.flatMap((option): ChoiceOption[] => {
    if (typeof option !== "object" || option === null) return [];
    const id = (option as { id?: unknown }).id;
    const label = (option as { label?: unknown }).label;
    const description = (option as { description?: unknown }).description;
    if (typeof id !== "string" || typeof label !== "string") return [];
    return [
      {
        id,
        label,
        description: typeof description === "string" ? description : undefined,
      },
    ];
  });

  if (parsedOptions.length === 0) return null;
  return {
    prompt,
    options: parsedOptions,
    multiple: (input as { multiple?: unknown }).multiple === true,
  };
}

function selectedIdsFromOutput(output: unknown): string[] {
  if (typeof output !== "object" || output === null) return [];
  const selectedIds = (output as { selectedIds?: unknown }).selectedIds;
  if (!Array.isArray(selectedIds)) return [];
  return selectedIds.filter((id): id is string => typeof id === "string");
}

export function ChoiceCard({ part, submitToolResult }: ChoiceCardProps) {
  const t = useTranslations("Agent");
  const input = useMemo(() => parseChoiceInput(part.input), [part.input]);
  const submittedIds = useMemo(
    () => selectedIdsFromOutput(part.output),
    [part.output],
  );
  const [lastInput, setLastInput] = useState<ChoiceInput | null>(input);
  const [selectedIds, setSelectedIds] = useState<string[]>(submittedIds);

  useEffect(() => {
    if (input) setLastInput(input);
  }, [input]);

  useEffect(() => {
    if (submittedIds.length > 0) setSelectedIds(submittedIds);
  }, [submittedIds]);

  const choice = input ?? lastInput;

  if (part.state === "input-streaming") {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
        {t("preparingChoices")}
      </div>
    );
  }

  if (!choice) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
        {t("invalidChoiceRequest")}
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
        {part.errorText ?? "Choice submission failed."}
      </div>
    );
  }

  const submitted = part.state === "output-available";
  const locked =
    submitted || part.state !== "input-available" || !submitToolResult;
  const activeIds = locked ? submittedIds : selectedIds;
  const activeIdSet = new Set(activeIds);

  function submit(ids: string[]) {
    if (
      !part.toolCallId ||
      !submitToolResult ||
      part.state !== "input-available" ||
      ids.length === 0
    ) {
      return;
    }
    submitToolResult(part.toolCallId, { selectedIds: ids });
  }

  function toggle(id: string) {
    if (locked || !choice) return;
    if (!choice.multiple) {
      setSelectedIds([id]);
      submit([id]);
      return;
    }

    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{choice.prompt}</p>
          {choice.multiple ? (
            <p className="mt-1 text-muted-foreground text-xs">
              Select one or more options.
            </p>
          ) : null}
        </div>
        {submitted ? <Badge variant="secondary">selected</Badge> : null}
        {!submitted && !submitToolResult ? (
          <Badge variant="secondary">unavailable</Badge>
        ) : null}
      </div>

      <div className="grid gap-2">
        {choice.options.map((option) => {
          const selected = activeIdSet.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={locked}
              onClick={() => toggle(option.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/20 hover:bg-muted/50",
                locked ? "cursor-default" : "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {selected ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-muted-foreground text-xs">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {!locked && choice.multiple ? (
        <Button
          type="button"
          size="sm"
          disabled={selectedIds.length === 0}
          onClick={() => submit(selectedIds)}
        >
          Continue
        </Button>
      ) : null}
    </div>
  );
}
