"use client";

import {
  DataTablePagination,
  useEventStream,
  usePaginatedQuery,
} from "@repo/frontend";
import { Button, Input, Spinner, Tabs, TabsList, TabsTrigger } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { API_ORIGIN, APP_CODE, appClient } from "@/lib/api";
import { ImportDialog } from "./import-dialog";
import { ItemCard } from "./item-card";
import { type CollectionItemRow, ItemQuickAdd } from "./item-quick-add";

const TYPE_FILTERS = [
  "ALL",
  "WORD",
  "PHRASE",
  "SENTENCE",
  "ARTICLE",
  "LINK",
] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

export function CollectionList() {
  const t = useTranslations("Collection");
  const queryClient = useQueryClient();
  const [type, setType] = useState<TypeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { items, total, page, pageSize, loading, setPage, refresh } =
    usePaginatedQuery<CollectionItemRow>({
      queryKey: ["collection-items", type, search] as const,
      queryFn: async ({ limit, offset }) => {
        const res = await appClient.api.collection.items.$get({
          query: {
            limit,
            offset,
            ...(type !== "ALL" ? { type } : {}),
            ...(search ? { q: search } : {}),
          },
        });
        const data = await res.json();
        return { items: data.items as CollectionItemRow[], total: data.total };
      },
    });

  useEventStream({
    origin: API_ORIGIN,
    appCode: APP_CODE,
    event: "collection.item.enriched",
    handler: () => {
      void queryClient.invalidateQueries({ queryKey: ["collection-items"] });
    },
  });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await appClient.api.collection.items.export.$get();
      if (!res.ok) {
        toast.error(t("exportFailed"));
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `studybuddy-collection-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(t("exportSuccess"));
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <ItemQuickAdd onCreated={refresh} />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={type}
          onValueChange={(v) => {
            setType(v as TypeFilter);
          }}
        >
          <TabsList>
            {TYPE_FILTERS.map((tf) => (
              <TabsTrigger key={tf} value={tf}>
                {tf === "ALL" ? t("all") : t(`types.${tf}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          {exporting ? t("exporting") : t("export")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="h-4 w-4" />
          {t("import")}
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          <DataTablePagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refresh}
      />
    </div>
  );
}
