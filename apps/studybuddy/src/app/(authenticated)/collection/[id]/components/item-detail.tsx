"use client";

import { Badge, Button, Spinner } from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import {
  type EnrichmentData,
  type EnrichmentKind,
  EnrichmentSection,
  KINDS_BY_TYPE,
} from "./enrichment-section";
import { ItemEditDialog } from "./item-edit-dialog";

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  WORD: "default",
  PHRASE: "secondary",
  SENTENCE: "outline",
  ARTICLE: "outline",
  LINK: "secondary",
};

interface ItemDetailProps {
  id: string;
}

export function ItemDetail({ id }: ItemDetailProps) {
  const t = useTranslations("Collection");
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busyKind, setBusyKind] = useState<string | null>(null);

  const queryKey = ["collection-item", id] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await appClient.api.collection.items[":id"].$get({
        param: { id },
      });
      if (!res.ok) throw new Error("Failed to load item");
      const data = (await res.json()) as {
        id: string;
        type: string;
        source: string;
        url: string | null;
        title: string | null;
        note: string | null;
        tags: string[];
        status: string;
        mastery: number;
        createdAt: string;
        updatedAt: string;
        enrichments: EnrichmentData[];
        attachments: Array<{ id: string; url: string }>;
      };
      return data;
    },
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey });
  }

  async function handleRegenerate(kind: EnrichmentKind | "all") {
    setBusyKind(kind);
    try {
      const res = await withApiFeedback(
        appClient.api.collection.items[":id"].enrich.$post,
      )({
        param: { id },
        json: kind === "all" ? {} : { kinds: [kind] },
      });
      if (!res.ok) return;
      refresh();
      toast.success(t("enrichSuccess"));
    } catch {
      // Error handled by API feedback.
    } finally {
      setBusyKind(null);
    }
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: t("delete"),
      description: t("confirmDelete"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      const res = await withApiFeedback(
        appClient.api.collection.items[":id"].$delete,
      )({ param: { id } });
      if (!res.ok) return;
      toast.success(t("deleteSuccess"));
      router.push("/collection");
    } catch {
      // Error handled by API feedback.
    }
  }

  if (query.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        {t("notFound")}
      </div>
    );
  }

  const item = query.data;
  const applicableKinds = KINDS_BY_TYPE[item.type] ?? [];
  const enrichmentsByKind = new Map(item.enrichments.map((e) => [e.kind, e]));
  const canEnrich = applicableKinds.length > 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/collection" />}
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Button>
      </div>

      <div className="rounded-lg border p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={TYPE_VARIANT[item.type] ?? "outline"}>
            {t(`types.${item.type}`)}
          </Badge>
          <Badge variant="outline">{t(`status.${item.status}`)}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDateTime(item.createdAt)}
          </span>
        </div>

        {item.type === "LINK" ? (
          <a
            href={item.url ?? item.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg inline-flex items-center gap-1.5 font-semibold hover:underline"
          >
            {item.title ?? item.source}
            <ExternalLink className="size-4" />
          </a>
        ) : (
          <p className="text-lg whitespace-pre-wrap break-words font-semibold">
            {item.source}
          </p>
        )}

        {item.title && item.type !== "LINK" && (
          <p className="mt-1 text-sm text-muted-foreground">{item.title}</p>
        )}
        {item.note && (
          <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
            {item.note}
          </p>
        )}

        {item.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.attachments.map((a) => (
              <Image
                key={a.id}
                src={a.url}
                alt={item.title ?? ""}
                width={160}
                height={120}
                unoptimized
                className="h-24 w-32 rounded border object-cover"
              />
            ))}
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {t("edit")}
          </Button>
          {canEnrich && (
            <Button
              size="sm"
              disabled={busyKind !== null}
              onClick={() => handleRegenerate("all")}
            >
              <Sparkles
                className={
                  busyKind === "all" ? "size-4 animate-spin" : "size-4"
                }
              />
              {t("enrichAll")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="size-4" />
            {t("delete")}
          </Button>
        </div>
      </div>

      {canEnrich ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {applicableKinds.map((kind) => (
            <EnrichmentSection
              key={kind}
              kind={kind}
              data={enrichmentsByKind.get(kind) ?? null}
              busy={busyKind === kind || busyKind === "all"}
              onRegenerate={(k) => handleRegenerate(k)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noEnrichmentForType")}
        </div>
      )}

      <ItemEditDialog
        itemId={item.id}
        open={editing}
        onOpenChange={setEditing}
        initial={{
          title: item.title,
          note: item.note,
          tags: item.tags,
          status: item.status,
          url: item.url,
        }}
        onSaved={refresh}
      />
    </div>
  );
}
