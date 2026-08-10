"use client";

import { DataTablePagination, usePaginatedQuery } from "@repo/frontend";
import { Input, Spinner, Tabs, TabsList, TabsTrigger } from "@repo/ui";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { appClient } from "@/lib/api";
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
  const [type, setType] = useState<TypeFilter>("ALL");
  const [search, setSearch] = useState("");

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
    </div>
  );
}
