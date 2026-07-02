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
import { useCallback, useEffect, useMemo, useState } from "react";
import { PaginatedTableFrame } from "./paginated-table-frame";

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  group: string;
  description?: string | null;
}

type SortKey = "name" | "description";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey | null;
  dir: SortDir;
}

interface PermissionSelectorProps {
  permissions: PermissionItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  pageSize?: number;
  height?: number;
  showDescription?: boolean;
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

function compare(a: PermissionItem, b: PermissionItem, key: SortKey): number {
  const av = (a[key] ?? "").toString();
  const bv = (b[key] ?? "").toString();
  return av.localeCompare(bv);
}

export function PermissionSelector({
  permissions,
  value,
  onChange,
  pageSize = 10,
  height,
  showDescription = true,
  i18nNamespace = "Frontend.permissionSelector",
  className,
}: PermissionSelectorProps) {
  const t = useTranslations(i18nNamespace);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const permMap = useMemo(
    () => new Map(permissions.map((p) => [p.id, p])),
    [permissions],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return permissions;
    return permissions.filter((p) => {
      return (
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.code.toLowerCase().includes(normalizedQuery) ||
        p.group.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [permissions, normalizedQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort.key) {
      const key = sort.key;
      arr.sort((a, b) => {
        const cmp = compare(a, b, key);
        return sort.dir === "desc" ? -cmp : cmp;
      });
    } else {
      arr.sort((a, b) => {
        const g = a.group.localeCompare(b.group);
        return g !== 0 ? g : a.code.localeCompare(b.code);
      });
    }
    return arr;
  }, [filtered, sort]);

  useEffect(() => {
    setPage(1);
  }, []);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const paged = useMemo(
    () => sorted.slice(startIdx, startIdx + pageSize),
    [sorted, startIdx, pageSize],
  );

  const selectedItems = useMemo(() => {
    return value
      .map((id) => permMap.get(id))
      .filter((p): p is PermissionItem => Boolean(p))
      .sort((a, b) => {
        const g = a.group.localeCompare(b.group);
        return g !== 0 ? g : a.name.localeCompare(b.name);
      });
  }, [value, permMap]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const filteredSelectedCount = useMemo(
    () => filteredIds.filter((id) => selectedSet.has(id)).length,
    [filteredIds, selectedSet],
  );
  const headerChecked =
    filteredIds.length > 0 && filteredSelectedCount === filteredIds.length;
  const headerIndeterminate =
    filteredSelectedCount > 0 && filteredSelectedCount < filteredIds.length;

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

  const toggleFiltered = useCallback(
    (checked: boolean) => {
      const next = new Set(value);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      onChange([...next]);
    },
    [value, filteredIds, onChange],
  );

  const cycleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  }, []);

  function renderSortIcon(key: SortKey) {
    if (sort.key !== key)
      return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
    return sort.dir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );
  }

  function SortableHead({
    keyName,
    label,
    className: headClassName,
  }: {
    keyName: SortKey;
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
    <>
      <Checkbox
        checked={headerChecked}
        indeterminate={headerIndeterminate}
        onCheckedChange={(checked) => toggleFiltered(!!checked)}
        disabled={permissions.length === 0}
      />
      <span className="text-xs text-muted-foreground">
        {t("selectAll")}
        {filteredSelectedCount > 0 && ` (${filteredSelectedCount})`}
      </span>
      <div className="relative ml-auto w-40">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-7 pl-7 text-xs"
        />
      </div>
    </>
  );

  return (
    <div
      className={cn("grid h-full grid-cols-1 gap-4 md:grid-cols-2", className)}
    >
      {/* Left: available table */}
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-md border"
        style={height ? { height } : undefined}
      >
        <PaginatedTableFrame
          loading={false}
          empty={sorted.length === 0}
          emptyMessage={permissions.length === 0 ? t("empty") : t("noResults")}
          page={currentPage}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          toolbar={toolbar}
          tableContainerClassName="min-h-0 min-w-0 flex-1 overflow-auto"
        >
          <TableHeader sticky>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 [&:has([role=checkbox])]:pr-0">
                <span className="sr-only">{t("selectAll")}</span>
              </TableHead>
              <SortableHead keyName="name" label="name" />
              {showDescription && (
                <SortableHead
                  keyName="description"
                  label="description"
                  className="hidden lg:table-cell"
                />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((item) => {
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
                  {showDescription && (
                    <TableCell className="hidden max-w-[200px] truncate text-muted-foreground lg:table-cell">
                      {item.description || "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </PaginatedTableFrame>
      </div>

      {/* Right: selected list */}
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-md border"
        style={height ? { height } : undefined}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {t("selected")} ({selectedItems.length})
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onChange([])}
            disabled={selectedItems.length === 0}
          >
            {t("clearAll")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {selectedItems.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("noSelected")}
            </div>
          ) : (
            <ul className="divide-y">
              {selectedItems.map((item) => (
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
