"use client";

import { Button, Input } from "@repo/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

export type CollectionItemType =
  | "WORD"
  | "PHRASE"
  | "SENTENCE"
  | "ARTICLE"
  | "LINK";

export type EnrichStatus = "none" | "pending" | "ok" | "failed";

export interface CollectionItemRow {
  id: string;
  type: CollectionItemType;
  source: string;
  url: string | null;
  title: string | null;
  note: string | null;
  tags: string[];
  status: string;
  enrichStatus: EnrichStatus;
  enrichmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

function detectType(source: string): CollectionItemType {
  const trimmed = source.trim();
  if (/^https?:\/\//i.test(trimmed)) return "LINK";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return "WORD";
  const endsWithPunctuation = /[.!?…]$/.test(trimmed);
  if (!endsWithPunctuation && words.length <= 5) return "PHRASE";
  if (words.length > 40) return "ARTICLE";
  return "SENTENCE";
}

interface ItemQuickAddProps {
  onCreated: () => void;
}

export function ItemQuickAdd({ onCreated }: ItemQuickAddProps) {
  const t = useTranslations("Collection");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = value.trim();
    if (!source) return;
    setSaving(true);
    try {
      const res = await withApiFeedback(appClient.api.collection.items.$post)({
        json: { type: detectType(source), source },
      });
      if (!res.ok) return;
      setValue("");
      toast.success(t("added"));
      onCreated();
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("quickAddPlaceholder")}
        className="flex-1"
      />
      <Button type="submit" disabled={saving || !value.trim()}>
        <Plus className="h-4 w-4" />
        {saving ? t("adding") : t("add")}
      </Button>
    </form>
  );
}
