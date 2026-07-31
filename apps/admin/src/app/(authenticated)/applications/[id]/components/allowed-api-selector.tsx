"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
} from "@repo/ui";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

type AvailableApiOperation = {
  operationId: string;
  method: string;
  path: string;
  summary?: string | null;
  description?: string | null;
  tags?: string[];
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PATCH:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-medium ${METHOD_COLORS[method] ?? "bg-muted text-muted-foreground"}`}
    >
      {method}
    </span>
  );
}

interface AllowedApiSelectorProps {
  appId: string;
  className?: string;
}

export function AllowedApiSelector({
  appId,
  className,
}: AllowedApiSelectorProps) {
  const t = useTranslations("Applications");
  const [available, setAvailable] = useState<AvailableApiOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const [availRes, selRes] = await Promise.all([
          withApiFeedback(
            appClient.api.applications[":id"]["allowed-apis"].available.$get,
          )({ param: { id: appId } }),
          withApiFeedback(
            appClient.api.applications[":id"]["allowed-apis"].$get,
          )({ param: { id: appId } }),
        ]);
        const [availData, selData] = await Promise.all([
          availRes.json(),
          selRes.json(),
        ]);
        setAvailable(availData as AvailableApiOperation[]);
        const loaded = new Set(selData as string[]);
        setSelectedIds(loaded);
        setInitialIds(loaded);
      } catch {
        setLoadError(true);
        toast.error(t("allowedApisLoadError"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [appId, t]);

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(
      (op) =>
        op.operationId.toLowerCase().includes(q) ||
        op.path.toLowerCase().includes(q) ||
        op.summary?.toLowerCase().includes(q) ||
        op.description?.toLowerCase().includes(q),
    );
  }, [available, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, AvailableApiOperation[]>();
    for (const op of filtered) {
      const tag = op.tags?.[0] ?? "Other";
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)?.push(op);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selectedList = useMemo(
    () => available.filter((op) => selectedIds.has(op.operationId)),
    [available, selectedIds],
  );

  const isDirty = useMemo(() => {
    if (selectedIds.size !== initialIds.size) return true;
    for (const id of selectedIds) {
      if (!initialIds.has(id)) return true;
    }
    return false;
  }, [selectedIds, initialIds]);

  function toggle(operationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(operationId)) next.delete(operationId);
      else next.add(operationId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(available.map((op) => op.operationId)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleSave() {
    setSaving(true);
    try {
      await withApiFeedback(
        appClient.api.applications[":id"]["allowed-apis"].$put,
      )({
        param: { id: appId },
        json: { operationIds: [...selectedIds] },
      });
      setInitialIds(new Set(selectedIds));
      toast.success(t("saveSuccess"));
    } catch {
      // Error handled by API feedback utils.
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className={`w-full ${className ?? ""}`.trim() || "w-full"}>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={["flex flex-col overflow-hidden", className]
        .filter(Boolean)
        .join(" ")}
    >
      <CardHeader>
        <CardTitle>{t("allowedApisTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("allowedApisDescription")}
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="grid min-h-0 flex-1 overflow-hidden grid-cols-1 gap-4 md:grid-cols-2">
          {/* Left panel: Available APIs */}
          <div className="flex flex-col rounded-md border h-full overflow-hidden">
            <div className="space-y-3 border-b p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {t("allowedApisAvailable")}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                  >
                    {t("allowedApisSelectAll")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAll}
                  >
                    {t("allowedApisDeselectAll")}
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("allowedApisSearchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {grouped.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("noResults")}
                </p>
              ) : (
                grouped.map(([tag, ops]) => (
                  <div key={tag}>
                    <div className="sticky top-0 z-10 border-b bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      {tag}
                    </div>
                    {ops.map((op) => {
                      const isSelected = selectedIds.has(op.operationId);
                      return (
                        <label
                          key={op.operationId}
                          className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggle(op.operationId)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <MethodBadge method={op.method} />
                              <code className="truncate text-sm font-medium">
                                {op.operationId}
                              </code>
                              <span className="truncate text-xs text-muted-foreground">
                                {op.path}
                              </span>
                            </div>
                            {op.summary && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {op.summary}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right panel: Selected APIs */}
          <div className="flex flex-col rounded-md border h-full overflow-hidden">
            <div className="border-b p-3">
              <span className="text-sm font-medium">
                {t("allowedApisSelected")} ({selectedList.length})
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {selectedList.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("allowedApisNoSelection")}
                </p>
              ) : (
                selectedList.map((op) => (
                  <div
                    key={op.operationId}
                    className="flex items-center gap-2 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30"
                  >
                    <MethodBadge method={op.method} />
                    <code className="truncate text-sm font-medium">
                      {op.operationId}
                    </code>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {op.path}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(op.operationId)}
                      aria-label={t("allowedApisRemove")}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={saving || loadError || !isDirty}
            onClick={handleSave}
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
