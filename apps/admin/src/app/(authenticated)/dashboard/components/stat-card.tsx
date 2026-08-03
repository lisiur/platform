"use client";

import { Card, CardContent, Skeleton } from "@repo/ui";
import Link from "next/link";
import type { ElementType } from "react";

interface StatCardProps {
  icon: ElementType;
  label: string;
  value?: number;
  href: string;
}

export function StatCard({ icon: Icon, label, value, href }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Card className="transition-colors group-hover:bg-accent/50">
        <CardContent className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-muted-foreground text-xs">{label}</p>
            {value === undefined ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="font-bold text-2xl tabular-nums">{value}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
