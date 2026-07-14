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
  useIsMobile,
} from "@repo/ui";
import { useTranslations } from "next-intl";

interface DataTablePaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  pageSlots?: number;
  showCount?: boolean;
  className?: string;
  onPageChange: (page: number) => void;
}

type PageItem =
  | {
      type: "fast-backward" | "fast-forward";
      active: false;
      key: string;
      page: number;
    }
  | {
      type: "page";
      page: number;
      active: boolean;
      mayBeFastBackward: boolean;
      mayBeFastForward: boolean;
    };

function createPageItemsInfo(
  currentPage: number,
  pageCount: number,
  pageSlot: number,
): {
  items: PageItem[];
} {
  if (pageCount === 1) {
    return {
      items: [
        {
          type: "page",
          page: 1,
          active: currentPage === 1,
          mayBeFastBackward: false,
          mayBeFastForward: false,
        },
      ],
    };
  }

  if (pageCount === 2) {
    return {
      items: [
        {
          type: "page",
          page: 1,
          active: currentPage === 1,
          mayBeFastBackward: false,
          mayBeFastForward: false,
        },
        {
          type: "page",
          page: 2,
          active: currentPage === 2,
          mayBeFastBackward: true,
          mayBeFastForward: false,
        },
      ],
    };
  }

  const firstPage = 1;
  const lastPage = pageCount;

  let middleStart = currentPage;
  let middleEnd = currentPage;

  const middleDelta = (pageSlot - 5) / 2;
  middleEnd += Math.ceil(middleDelta);
  middleEnd = Math.min(
    Math.max(middleEnd, firstPage + pageSlot - 3),
    lastPage - 2,
  );

  middleStart -= Math.floor(middleDelta);
  middleStart = Math.max(
    Math.min(middleStart, lastPage - pageSlot + 3),
    firstPage + 2,
  );

  const leftSplit = middleStart > firstPage + 2;
  const rightSplit = middleEnd < lastPage - 2;

  const items: PageItem[] = [];

  items.push({
    type: "page",
    page: 1,
    active: currentPage === 1,
    mayBeFastBackward: false,
    mayBeFastForward: false,
  });

  if (leftSplit) {
    items.push({
      type: "fast-backward",
      active: false,
      key: "fast-backward",
      page: middleStart - 1,
    });
  } else if (lastPage >= firstPage + 1) {
    items.push({
      type: "page",
      page: firstPage + 1,
      mayBeFastBackward: true,
      mayBeFastForward: false,
      active: currentPage === firstPage + 1,
    });
  }

  for (let i = middleStart; i <= middleEnd; ++i) {
    items.push({
      type: "page",
      page: i,
      mayBeFastBackward: false,
      mayBeFastForward: false,
      active: currentPage === i,
    });
  }

  if (rightSplit) {
    items.push({
      type: "fast-forward",
      active: false,
      key: "fast-forward",
      page: middleEnd + 1,
    });
  } else if (
    middleEnd === lastPage - 2 &&
    items[items.length - 1].page !== lastPage - 1
  ) {
    items.push({
      type: "page",
      mayBeFastForward: true,
      mayBeFastBackward: false,
      page: lastPage - 1,
      active: currentPage === lastPage - 1,
    });
  }

  if (items[items.length - 1].page !== lastPage) {
    items.push({
      type: "page",
      mayBeFastForward: false,
      mayBeFastBackward: false,
      page: lastPage,
      active: currentPage === lastPage,
    });
  }

  return { items };
}

export function DataTablePagination({
  page,
  total,
  pageSize = 10,
  pageSlots = 7,
  showCount = true,
  className,
  onPageChange,
}: DataTablePaginationProps) {
  const t = useTranslations("Frontend.dataTablePagination");
  const isMobile = useIsMobile();
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (totalPages <= 1) return null;

  const { items } = createPageItemsInfo(
    page,
    totalPages,
    isMobile ? 5 : pageSlots,
  );

  return (
    <div className={cn("flex items-center justify-between py-4", className)}>
      {showCount && !isMobile && (
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          {t("showing")} {start}-{end} {t("of")} {total}
        </p>
      )}
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
          {items.map((item) => {
            if (item.type === "fast-backward" || item.type === "fast-forward") {
              return (
                <PaginationItem key={item.key}>
                  <PaginationEllipsis onClick={() => onPageChange(item.page)} />
                </PaginationItem>
              );
            }
            return (
              <PaginationItem key={item.page}>
                <PaginationLink
                  isActive={item.active}
                  onClick={() => onPageChange(item.page)}
                  className="cursor-pointer"
                >
                  {item.page}
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
