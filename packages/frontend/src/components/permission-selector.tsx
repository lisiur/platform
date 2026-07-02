"use client";

import {
  Button,
  Checkbox,
  cn,
  Input,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PaginatedTableFrame } from "./paginated-table-frame";

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  group: string;
  description?: string | null;
}

export type PermissionSortKey = "name" | "description";
export type PermissionSortDir = "asc" | "desc";

interface SortState {
  key: PermissionSortKey | null;
  dir: PermissionSortDir;
}

export interface FetchPageParams {
  search: string;
  sort: PermissionSortKey | null;
  sortDir: PermissionSortDir;
  limit: number;
  offset: number;
}

export interface FetchPageResult {
  permissions: PermissionItem[];
  total: number;
}

interface PermissionSelectorProps {
  fetchPage: (params: FetchPageParams) => Promise<FetchPageResult>;
  value: string[];
  onChange: (ids: string[]) => void;
  selectedItems: PermissionItem[];
  pageSize?: number;
  i18nNamespace?: string;
  emptyText?: string;
  noResultsText?: string;
  searchPlaceholder?: string;
  selectAllText?: string;
  selectedHeaderText?: string;
  selectedEmptyText?: string;
  clearAllText?: string;
  previousText?: string;
  nextText?: string;
  className?: string;
}

export function PermissionSelector({
  fetchPage,
  value,
  onChange,
  selectedItems,
  pageSize = 10,
  i18nNamespace = "Frontend.permissionSelector",
  className,
}: PermissionSelectorProps) {
  const t = useTranslations(i18nNamespace);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<PermissionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seenItems, setSeenItems] = useState<PermissionItem[]>(selectedItems);

  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const reqIdRef = useRef(0);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const detailsMap = useMemo(
    () => new Map(seenItems.map((p) => [p.id, p])),
    [seenItems],
  );

  useEffect(() => {
    setSeenItems((prev) => {
      const m = new Map(prev.map((p) => [p.id, p]));
      for (const p of selectedItems) m.set(p.id, p);
      return [...m.values()];
    });
  }, [selectedItems]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, []);

  useEffect(() => {
    let active = true;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    fetchPageRef
      .current({
        search: debouncedQuery.trim(),
        sort: sort.key,
        sortDir: sort.dir,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      .then((res) => {
        if (!active || reqId !== reqIdRef.current) return;
        setPageData(res.permissions);
        setTotal(res.total);
        setSeenItems((prev) => {
          const m = new Map(prev.map((p) => [p.id, p]));
          for (const p of res.permissions) m.set(p.id, p);
          return [...m.values()];
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, sort, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const selectedList = useMemo(
    () =>
      value
        .map((id) => detailsMap.get(id))
        .filter((p): p is PermissionItem => Boolean(p))
        .sort((a, b) => {
          const g = a.group.localeCompare(b.group);
          return g !== 0 ? g : a.name.localeCompare(b.name);
        }),
    [value, detailsMap],
  );

  const pageIds = useMemo(() => pageData.map((p) => p.id), [pageData]);
  const pageSelectedCount = pageIds.filter((id) => selectedSet.has(id)).length;
  const headerChecked =
    pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const headerIndeterminate =
    pageSelectedCount > 0 && pageSelectedCount < pageIds.length;

  const toggle = useCallback(
    (id: string, checked: boolean) => {
      if (checked) {
        if (!selectedSet.has(id)) onChange([...value, id]);
      } else if (selectedSet.has(id)) {
        onChange(value.filter((x) => x !== id));
      }
    },
    [value, selectedSet, onChange],
  );

  const togglePageAll = useCallback(
    (checked: boolean) => {
      const next = new Set(value);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      onChange([...next]);
    },
    [value, pageIds, onChange],
  );

  const cycleSort = useCallback((key: PermissionSortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
    setPage(1);
  }, []);

  function renderSortIcon(key: PermissionSortKey) {
    if (sort.key !== key)
      return (
        <ArrowUpDown
          width={14}
          height={14}
          className="text-muted-foreground/50"
        />
      );
    return sort.dir === "asc" ? (
      <ArrowUp width={14} height={14} />
    ) : (
      <ArrowDown width={14} height={14} />
    );
  }

  function SortableHead({
    keyName,
    label,
    className: headClassName,
  }: {
    keyName: PermissionSortKey;
    label: string;
    className?: string;
  }) {
    return (
      <TableHead className={headClassName}>
        <button
          type="button"
          onClick={() => cycleSort(keyName)}
          className="inline-flex items-center gap-1 border-0 bg-transparent p-0 font-medium capitalize text-foreground hover:text-primary"
        >
          {label}
          {renderSortIcon(keyName)}
        </button>
      </TableHead>
    );
  }

  const toolbar = (
    <div className="pt-4 px-4 w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </div>
    </div>
  );

  const isEmpty = !loading && pageData.length === 0;

  return (
    <div
      className={cn("grid h-full grid-cols-1 gap-4 md:grid-cols-2", className)}
    >
      {/* Left: available table */}
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-md border"
      >
        <PaginatedTableFrame
          loading={loading}
          empty={isEmpty}
          emptyMessage={
            total === 0 && !debouncedQuery ? t("empty") : t("noResults")
          }
          page={currentPage}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          pageSlots={5}
          showCount={false}
          toolbar={toolbar}
          tableContainerClassName="min-h-0 min-w-0 flex-1 overflow-auto"
        >
          <TableHeader sticky>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 [&:has([role=checkbox])]:pr-0">
                <Checkbox
                  checked={headerChecked}
                  indeterminate={headerIndeterminate}
                  onCheckedChange={(checked) => togglePageAll(!!checked)}
                  disabled={total === 0}
                  aria-label={t("selectAll")}
                />
              </TableHead>
              <SortableHead keyName="name" label={t("name")} />
              <TableHead className="lg:table-cell">
                {t("description")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((item) => {
              const checked = selectedSet.has(item.id);
              return (
                <TableRow
                  key={item.id}
                  data-state={checked ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => toggle(item.id, !checked)}
                >
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    className="w-8 align-top [&:has([role=checkbox])]:pr-0"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggle(item.id, !!c)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <code className="text-xs text-muted-foreground">
                      {item.code}
                    </code>
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground lg:table-cell">
                    {item.description || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </PaginatedTableFrame>
      </div>

      {/* Right: selected list */}
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-md border"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {t("selected")} ({selectedList.length})
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onChange([])}
            disabled={selectedList.length === 0}
          >
            {t("clearAll")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {selectedList.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("noSelected")}
            </div>
          ) : (
            <ul className="divide-y">
              {selectedList.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {item.name}
                    </div>
                    <code className="text-[10px] text-muted-foreground">
                      {item.code}
                    </code>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => toggle(item.id, false)}
                    aria-label={t("remove", { name: item.name })}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
