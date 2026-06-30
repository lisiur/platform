"use client";

import type * as React from "react";

import { cn } from "#lib/utils";

type CellAlign = "left" | "center" | "right";
type StickySide = "right";

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
        "border-b transition-colors duration-150 ease-in-out [&>td]:transition-colors [&>td]:duration-150 [&>td]:ease-in-out hover:bg-muted/50 hover:[&>td]:bg-muted has-aria-expanded:bg-muted/50 has-aria-expanded:[&>td]:bg-muted data-[state=selected]:bg-muted data-[state=selected]:[&>td]:bg-muted",
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
          "sticky right-0 z-30 bg-background shadow-[-1px_0_0_0_var(--border)]",
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
        className,
      )}
      {...props}
    />
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
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
