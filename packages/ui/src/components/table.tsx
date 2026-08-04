"use client";

import { EllipsisIcon } from "lucide-react";
import type * as React from "react";

import { Button } from "#components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "#components/dropdown-menu";
import { cn } from "#lib/utils";

type CellAlign = "left" | "center" | "right";
type StickySide = "left" | "right";

type TableCellOptions = {
  align?: CellAlign;
  sticky?: StickySide;
};

const cellAlignClassName: Record<CellAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative min-w-0 w-full overflow-x-auto",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b",
        sticky && "[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "group/table-row border-b transition-colors duration-150 ease-in-out [&>td]:transition-colors [&>td]:duration-150 [&>td]:ease-in-out hover:bg-muted/50 hover:[&>td]:bg-muted has-aria-expanded:bg-muted/50 has-aria-expanded:[&>td]:bg-muted data-[state=selected]:bg-muted data-[state=selected]:[&>td]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  align,
  sticky,
  ...props
}: React.ComponentProps<"th"> & TableCellOptions) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        align && cellAlignClassName[align],
        sticky === "right" &&
          "sticky right-0 z-30! bg-background shadow-[-1px_0_0_0_var(--border)]",
        sticky === "left" &&
          "sticky left-0 z-30! bg-background shadow-[1px_0_0_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  align,
  sticky,
  ...props
}: React.ComponentProps<"td"> & TableCellOptions) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "bg-background p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        align && cellAlignClassName[align],
        sticky === "right" &&
          "sticky right-0 z-10 shadow-[-1px_0_0_0_var(--border)]",
        sticky === "left" &&
          "sticky left-0 z-10 shadow-[1px_0_0_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

function TableActionHead({
  className,
  ...props
}: Omit<React.ComponentProps<"th"> & TableCellOptions, "align" | "sticky">) {
  return (
    <TableHead
      sticky="right"
      align="right"
      className={cn("w-12 p-0 md:bg-transparent! md:shadow-none", className)}
      {...props}
    />
  );
}

function TableActionCell({
  className,
  children,
  menu,
  menuLabel,
  ...props
}: Omit<React.ComponentProps<"td"> & TableCellOptions, "align" | "sticky"> & {
  menu?: React.ReactNode;
  menuLabel: string;
}) {
  return (
    <TableCell
      sticky="right"
      align="right"
      className={cn(
        "w-12 p-0 md:bg-transparent md:shadow-none md:group-hover/table-row:bg-background md:group-hover/table-row:shadow-[-1px_0_0_0_var(--border)] md:group-has-[:focus-visible]/table-row:bg-background md:group-has-[:focus-visible]/table-row:shadow-[-1px_0_0_0_var(--border)]",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "hidden h-full md:absolute md:top-1/2 md:right-[1px] md:z-20 md:flex md:-translate-y-1/2 md:items-center md:gap-1 md:rounded-lg md:bg-background/95 md:p-1 md:opacity-0 md:shadow-sm md:ring-1 md:ring-border md:backdrop-blur md:transition-opacity md:duration-150 md:pointer-events-none md:group-hover/table-row:pointer-events-auto md:group-hover/table-row:opacity-100 md:group-has-[:focus-visible]/table-row:pointer-events-auto md:group-has-[:focus-visible]/table-row:opacity-100",
          menu
            ? "md:[@media(any-hover:none)]:hidden!"
            : "md:[@media(any-hover:none)]:pointer-events-auto! md:[@media(any-hover:none)]:opacity-100!",
        )}
      >
        {children}
      </div>
      {menu ? (
        <div className="flex justify-end p-2 md:[@media(any-hover:hover)]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={menuLabel}>
                  <EllipsisIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </TableCell>
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
