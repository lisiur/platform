"use client";

import { Badge, Button } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { CacheEditor } from "./components/cache-editor";
import { CacheTree } from "./components/cache-tree";

interface CacheKeyInfo {
  fullKey: string;
  namespace: string;
  key: string;
  valueType: string;
}

interface CacheStats {
  totalKeys: number;
  maxSize: number;
  namespaces: { name: string; keyCount: number }[];
}

export default function CachePage() {
  const t = useTranslations("Cache");
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["cache-stats"],
    queryFn: async () => {
      const res = await appClient.api.cache.stats.$get();
      return (await res.json()) as CacheStats;
    },
  });

  const {
    data: keysData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["cache-keys", search],
    queryFn: async () => {
      const res = await appClient.api.cache.keys.$get({
        query: { search: search || undefined },
      });
      return (await res.json()) as CacheKeyInfo[];
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await withApiFeedback(appClient.api.cache.all.$delete)({});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cache-keys"] });
      queryClient.invalidateQueries({ queryKey: ["cache-stats"] });
      setSelectedKey(null);
    },
  });

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="mb-4 flex shrink-0 items-center gap-3">
        {stats && (
          <>
            <Badge variant="secondary">
              <Database className="mr-1 h-3 w-3" />
              {t("stats.totalKeys", { count: stats.totalKeys })}
            </Badge>
            <Badge variant="outline">
              {t("stats.maxSize", { count: stats.maxSize })}
            </Badge>
          </>
        )}
        <div className="flex-1" />
        <Button
          variant="destructive"
          size="sm"
          disabled={clearAllMutation.isPending || stats?.totalKeys === 0}
          onClick={() => clearAllMutation.mutate()}
        >
          <Trash2 className="h-4 w-4" />
          {t("clearAll")}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        <div className="w-80 shrink-0">
          <CacheTree
            keys={keysData ?? []}
            isLoading={isLoading}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
            search={search}
            onSearchChange={setSearch}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
          />
        </div>
        <div className="flex-1">
          <CacheEditor
            selectedKey={selectedKey}
            onDeleted={() => setSelectedKey(null)}
          />
        </div>
      </div>
    </ManagementPageShell>
  );
}
