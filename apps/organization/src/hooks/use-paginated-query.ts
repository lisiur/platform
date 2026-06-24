"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

type PaginatedResult<T> = {
  items: T[];
  total: number;
};

type UsePaginatedQueryOptions<T> = {
  queryKey: readonly unknown[];
  queryFn: (params: {
    limit: number;
    offset: number;
    page: number;
  }) => Promise<PaginatedResult<T>>;
  pageSize?: number;
  enabled?: boolean;
};

export function usePaginatedQuery<T>({
  queryKey,
  queryFn,
  pageSize = 10,
  enabled = true,
}: UsePaginatedQueryOptions<T>) {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: [...queryKey, { page, pageSize }],
    queryFn: () =>
      queryFn({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        page,
      }),
    placeholderData: keepPreviousData,
    enabled,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page,
    pageSize,
    loading: query.isLoading,
    isPlaceholderData: query.isPlaceholderData,
    setPage,
    refresh: query.refetch,
  };
}
