"use client";

import type { ReactNode } from "react";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table } from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface PaginatedTableFrameProps {
  loading: boolean;
  empty: boolean;
  emptyMessage: ReactNode;
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PaginatedTableFrame({
  loading,
  empty,
  emptyMessage,
  page,
  total,
  pageSize,
  onPageChange,
  toolbar,
  children,
  className,
}: PaginatedTableFrameProps) {
  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {toolbar && (
        <div className="mb-4 flex shrink-0 items-center">{toolbar}</div>
      )}

      {empty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
            {children}
          </Table>

          {total > pageSize && (
            <DataTablePagination
              className="shrink-0"
              page={page}
              total={total}
              pageSize={pageSize}
              onPageChange={onPageChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
