"use client";

import {
  cn,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui";
import { useTranslations } from "next-intl";

interface DataTablePaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  className?: string;
  onPageChange: (page: number) => void;
}

function getPageNumbers(
  current: number,
  totalPages: number,
): (number | "ellipsis-start" | "ellipsis-end")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [1];

  if (current <= 4) {
    for (let i = 2; i <= 5; i++) pages.push(i);
    pages.push("ellipsis-end");
  } else if (current >= totalPages - 3) {
    pages.push("ellipsis-start");
    for (let i = totalPages - 4; i < totalPages; i++) pages.push(i);
  } else {
    pages.push("ellipsis-start");
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push("ellipsis-end");
  }

  pages.push(totalPages);
  return pages;
}

export function DataTablePagination({
  page,
  total,
  pageSize = 10,
  className,
  onPageChange,
}: DataTablePaginationProps) {
  const t = useTranslations("Common");
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);

  return (
    <div className={cn("flex items-center justify-between py-4", className)}>
      <p className="text-sm text-muted-foreground whitespace-nowrap">
        {t("showing")} {start}-{end} {t("of")} {total}
      </p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text={t("previous")}
              onClick={() => onPageChange(page - 1)}
              className={
                page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
              }
            />
          </PaginationItem>
          {pages.map((p) => {
            if (p === "ellipsis-start" || p === "ellipsis-end") {
              return (
                <PaginationItem key={p}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }
            return (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === page}
                  onClick={() => onPageChange(p)}
                  className="cursor-pointer"
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            );
          })}
          <PaginationItem>
            <PaginationNext
              text={t("next")}
              onClick={() => onPageChange(page + 1)}
              className={
                page === totalPages
                  ? "pointer-events-none opacity-50"
                  : "cursor-pointer"
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
