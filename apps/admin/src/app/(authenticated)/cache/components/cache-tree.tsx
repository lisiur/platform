"use client";

import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Database,
  Eraser,
  RefreshCw,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface CacheKeyInfo {
  fullKey: string;
  namespace: string;
  key: string;
  valueType: string;
}

interface TreeGroup {
  name: string;
  fullPath: string;
  children: Map<string, TreeGroup>;
  keys: CacheKeyInfo[];
}

function buildTree(keys: CacheKeyInfo[]): TreeGroup[] {
  const root: TreeGroup = {
    name: "",
    fullPath: "",
    children: new Map(),
    keys: [],
  };

  for (const k of keys) {
    const parts = k.namespace.split(":").filter(Boolean);
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const fullPath = parts.slice(0, i + 1).join(":");
      if (!node.children.has(fullPath)) {
        node.children.set(fullPath, {
          name: parts[i],
          fullPath,
          children: new Map(),
          keys: [],
        });
      }
      const child = node.children.get(fullPath);
      if (child) node = child;
    }

    node.keys.push(k);
  }

  if (root.keys.length > 0) {
    const result: TreeGroup[] = [
      {
        name: "global",
        fullPath: "",
        children: new Map(),
        keys: root.keys,
      },
    ];
    for (const child of root.children.values()) {
      result.push(child);
    }
    return result.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  }

  return [...root.children.values()].sort((a, b) =>
    a.fullPath.localeCompare(b.fullPath),
  );
}

function countKeys(group: TreeGroup): number {
  return (
    group.keys.length +
    [...group.children.values()].reduce(
      (sum, child) => sum + countKeys(child),
      0,
    )
  );
}

interface CacheTreeProps {
  keys: CacheKeyInfo[];
  isLoading: boolean;
  selectedKey: string | null;
  onSelectKey: (fullKey: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function CacheTree({
  keys,
  isLoading,
  selectedKey,
  onSelectKey,
  search,
  onSearchChange,
  onRefresh,
  isRefreshing,
}: CacheTreeProps) {
  const t = useTranslations("Cache.tree");
  const queryClient = useQueryClient();

  const tree = useMemo(() => buildTree(keys), [keys]);

  const clearNamespaceMutation = useMutation({
    mutationFn: async (namespace: string) => {
      await withApiFeedback(appClient.api.cache.namespace.$delete)({
        json: { namespace },
      });
    },
    onSuccess: (_data, namespace) => {
      toast.success(t("namespaceCleared", { namespace }));
      void queryClient.invalidateQueries({ queryKey: ["cache-keys"] });
      void queryClient.invalidateQueries({ queryKey: ["cache-stats"] });
    },
  });

  const renderGroup = (group: TreeGroup, depth: number) => {
    const hasChildren = group.children.size > 0;
    const hasKeys = group.keys.length > 0;
    const hasContent = hasChildren || hasKeys;
    const totalItems = countKeys(group);

    return (
      <Collapsible key={group.fullPath || group.name}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className={`group flex h-auto w-full items-center gap-1 justify-start rounded-md py-1 px-2 font-normal hover:bg-accent ${depth === 0 ? "mt-1" : ""}`}
            />
          }
        >
          <span className="shrink-0" style={{ width: `${depth * 12}px` }} />
          {hasContent ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left text-sm font-medium">
            {group.name}
          </span>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {totalItems}
          </Badge>
          <Tooltip>
            <TooltipTrigger
              render={
                // biome-ignore lint/a11y/useSemanticElements: cannot nest <button> inside CollapsibleTrigger's <button>
                <span
                  role="button"
                  tabIndex={clearNamespaceMutation.isPending ? -1 : 0}
                  aria-disabled={clearNamespaceMutation.isPending}
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${clearNamespaceMutation.isPending ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    clearNamespaceMutation.mutate(group.fullPath);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      clearNamespaceMutation.mutate(group.fullPath);
                    }
                  }}
                />
              }
            >
              <Eraser className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t("clearNamespace")}</TooltipContent>
          </Tooltip>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {hasKeys && (
            <div>
              {group.keys.map((k) => (
                <button
                  type="button"
                  key={k.fullKey}
                  className={`flex w-full items-center gap-1 rounded-md py-2 pr-2 cursor-pointer hover:bg-accent ${
                    selectedKey === k.fullKey ? "bg-primary/10" : ""
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                  onClick={() => onSelectKey(k.fullKey)}
                >
                  <span className="flex-1 truncate text-left font-mono text-xs text-muted-foreground">
                    {k.key}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {k.valueType}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {[...group.children.values()]
            .sort((a, b) => a.fullPath.localeCompare(b.fullPath))
            .map((child) => renderGroup(child, depth + 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {isLoading ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            {t("loading")}
          </div>
        ) : tree.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            {t("empty")}
          </div>
        ) : (
          tree.map((group) => renderGroup(group, 0))
        )}
      </div>
    </div>
  );
}
