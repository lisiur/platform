"use client";

import { useCallback, useEffect, useState } from "react";

type FetchPageArgs = {
  limit: number;
  offset: number;
  page: number;
};

type FetchPageResult<T> = {
  items: T[];
  total: number;
};

type UsePaginatedApiQueryOptions<T> = {
  pageSize?: number;
  fetchPage: (args: FetchPageArgs) => Promise<FetchPageResult<T>>;
};

export function usePaginatedApiQuery<T>({
  pageSize = 10,
  fetchPage,
}: UsePaginatedApiQueryOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPage({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        page,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, page, pageSize]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  };
}
