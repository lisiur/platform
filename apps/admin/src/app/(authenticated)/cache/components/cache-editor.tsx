"use client";

import { Badge, Button, Textarea } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface CacheEntry {
  fullKey: string;
  namespace: string;
  key: string;
  valueType: string;
  value: unknown;
}

interface CacheEditorProps {
  selectedKey: string | null;
  onDeleted: () => void;
}

function serializeValue(value: unknown, valueType: string): string {
  if (valueType === "object" || valueType === "array") {
    return JSON.stringify(value, null, 2);
  }
  if (value === null) return "null";
  return String(value);
}

function parseValue(text: string, valueType: string): unknown {
  if (valueType === "object" || valueType === "array") {
    return JSON.parse(text);
  }
  if (valueType === "number") return Number(text);
  if (valueType === "boolean") return text === "true";
  if (valueType === "null") return null;
  return text;
}

export function CacheEditor({ selectedKey, onDeleted }: CacheEditorProps) {
  const t = useTranslations("Cache.editor");
  const queryClient = useQueryClient();
  const [editedValue, setEditedValue] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  const { data: entry, isLoading } = useQuery({
    queryKey: ["cache-entry", selectedKey],
    queryFn: async () => {
      if (!selectedKey) return null;
      const res = await appClient.api.cache.entry.$get({
        query: { key: selectedKey },
      });
      return (await res.json()) as CacheEntry;
    },
    enabled: !!selectedKey,
  });

  useEffect(() => {
    if (entry) {
      setEditedValue(serializeValue(entry.value, entry.valueType));
      setDirty(false);
    }
  }, [entry]);

  const handleValueChange = (text: string) => {
    setEditedValue(text);
    setDirty(
      text !== serializeValue(entry?.value, entry?.valueType ?? "unknown"),
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedKey || !entry) return;
      const parsed = parseValue(editedValue, entry.valueType);
      await withApiFeedback(appClient.api.cache.entry.$put)({
        json: { key: selectedKey, value: parsed },
      });
    },
    onSuccess: () => {
      toast.success(t("saveSuccess"));
      void queryClient.invalidateQueries({
        queryKey: ["cache-entry", selectedKey],
      });
      void queryClient.invalidateQueries({ queryKey: ["cache-keys"] });
      void queryClient.invalidateQueries({ queryKey: ["cache-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedKey) return;
      await withApiFeedback(appClient.api.cache.entry.$delete)({
        query: { key: selectedKey },
      });
    },
    onSuccess: () => {
      toast.success(t("deleteSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["cache-keys"] });
      void queryClient.invalidateQueries({ queryKey: ["cache-stats"] });
      onDeleted();
    },
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedValue);
    toast.success(t("copied"));
  };

  if (!selectedKey) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t("selectKey")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t("loading")}
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t("notFound")}
      </div>
    );
  }

  const isEditable =
    entry.valueType === "object" ||
    entry.valueType === "array" ||
    entry.valueType === "string" ||
    entry.valueType === "number" ||
    entry.valueType === "boolean";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("key")}
          </span>
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
            {entry.fullKey}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {t("namespace")}:{" "}
            <span className="font-mono">{entry.namespace}</span>
          </span>
          <Badge variant="outline">{entry.valueType}</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {entry.valueType === "boolean" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editedValue === "true"}
              onChange={(e) => handleValueChange(String(e.target.checked))}
              className="h-4 w-4"
            />
            {t("booleanValue")}
          </label>
        ) : entry.valueType === "number" ? (
          <input
            type="number"
            value={editedValue}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring"
          />
        ) : (
          <Textarea
            value={editedValue}
            onChange={(e) => handleValueChange(e.target.value)}
            className="min-h-[300px] resize-y font-mono text-sm"
            readOnly={!isEditable}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          <Save className="h-4 w-4" />
          {t("save")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
          {t("copy")}
        </Button>
        <div className="flex-1" />
        {dirty && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Check className="h-3 w-3" />
            {t("unsavedChanges")}
          </span>
        )}
        <Button
          variant="destructive"
          size="sm"
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          <Trash2 className="h-4 w-4" />
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}
