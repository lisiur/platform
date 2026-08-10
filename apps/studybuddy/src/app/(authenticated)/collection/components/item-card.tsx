"use client";

import { Badge } from "@repo/ui";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatRelativeTime } from "@/utils/date";
import type { CollectionItemType } from "./item-quick-add";

const TYPE_VARIANT: Record<
  CollectionItemType,
  "default" | "secondary" | "outline" | "destructive"
> = {
  WORD: "default",
  PHRASE: "secondary",
  SENTENCE: "outline",
  ARTICLE: "outline",
  LINK: "secondary",
};

interface ItemCardProps {
  item: {
    id: string;
    type: CollectionItemType;
    source: string;
    title: string | null;
    note: string | null;
    url: string | null;
    tags: string[];
    enrichmentsCount: number;
    createdAt: string;
  };
}

export function ItemCard({ item }: ItemCardProps) {
  const t = useTranslations("Collection");

  const displayTitle =
    item.type === "LINK"
      ? (item.title ?? item.source)
      : (item.title ?? item.source);
  const isLink = item.type === "LINK";

  return (
    <Link
      href={`/collection/${item.id}`}
      className="group flex h-full min-h-0 flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        <Badge variant={TYPE_VARIANT[item.type]} className="shrink-0">
          {t(`types.${item.type}`)}
        </Badge>
        {item.enrichmentsCount > 0 && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {t("enriched", { count: item.enrichmentsCount })}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>

      <div className="line-clamp-3 text-sm font-medium break-words">
        {displayTitle}
      </div>

      {item.note && (
        <div className="line-clamp-2 text-xs text-muted-foreground">
          {item.note}
        </div>
      )}

      {isLink && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{item.url ?? item.source}</span>
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {item.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
          {item.tags.length > 4 && (
            <span className="text-[10px] text-muted-foreground">
              +{item.tags.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
