"use client";

import { Badge, Button, Card, CardContent, Spinner } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Landmark,
  Pencil,
  Plus,
  Scale,
  Trash2,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useAccountName } from "@/hooks/use-account-name";
import { useConfirm } from "@/hooks/use-confirm";
import {
  type RealAccountDto,
  realAccountsQueryKey,
  useRealAccounts,
} from "@/hooks/use-real-accounts";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatAmount } from "@/utils/amount";
import { RealAccountDialog } from "./real-account-dialog";

const TYPE_BADGE: Record<RealAccountDto["type"], string> = {
  asset: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  liability: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: number | undefined;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-muted-foreground text-xs">{label}</p>
          <p className={`font-bold text-2xl tabular-nums ${toneClass}`}>
            {value === undefined ? "—" : formatAmount(value)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function RealAccountsView() {
  const t = useTranslations("RealAccounts");
  const accountName = useAccountName();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data, isLoading } = useRealAccounts();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RealAccountDto | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: realAccountsQueryKey });
  }

  async function handleArchiveToggle(real: RealAccountDto) {
    const archiving = real.status === "active";
    try {
      await withApiFeedback(
        appClient.api.bookkeeping["real-accounts"][":id"].$patch,
      )({
        param: { id: real.id },
        json: { status: archiving ? "archived" : "active" },
      });
      invalidate();
      toast.success(archiving ? t("archiveSuccess") : t("unarchiveSuccess"));
    } catch {
      // handled by withApiFeedback
    }
  }

  async function handleDelete(real: RealAccountDto) {
    const confirmed = await confirm({
      title: t("delete"),
      description: t("confirmDelete", { name: real.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      await withApiFeedback(
        appClient.api.bookkeeping["real-accounts"][":id"].$delete,
      )({
        param: { id: real.id },
      });
      invalidate();
      toast.success(t("deleteSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Unlink")) {
        toast.error(t("hasPocketsError"));
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const realAccounts = data?.realAccounts ?? [];
  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Wallet} label={t("assets")} value={totals?.assets} />
        <StatCard
          icon={Scale}
          label={t("liabilities")}
          value={totals?.liabilities}
        />
        <StatCard
          icon={Landmark}
          label={t("netWorth")}
          value={totals?.netWorth}
          tone={totals && totals.netWorth < 0 ? "negative" : "default"}
        />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{t("title")}</h3>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      {realAccounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">{t("empty")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {realAccounts.map((real) => (
            <Card key={real.id}>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  {real.icon && (
                    <span aria-hidden className="text-xl">
                      {real.icon}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <h4 className="truncate font-medium">{real.name}</h4>
                    <Badge variant="outline" className={TYPE_BADGE[real.type]}>
                      {t(`types.${real.type}`)}
                    </Badge>
                    {real.status === "archived" && (
                      <Badge variant="secondary">{t("archivedBadge")}</Badge>
                    )}
                  </div>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {formatAmount(real.balance)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("edit")}
                      onClick={() => setEditing(real)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        real.status === "active" ? t("archive") : t("unarchive")
                      }
                      onClick={() => handleArchiveToggle(real)}
                    >
                      {real.status === "active" ? (
                        <Archive />
                      ) : (
                        <ArchiveRestore />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("delete")}
                      onClick={() => handleDelete(real)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {real.pockets.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("noPockets")}
                  </p>
                ) : (
                  <div className="space-y-1.5 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">
                      {t("pockets")}
                    </p>
                    <ul className="space-y-1.5">
                      {real.pockets.map((pocket) => (
                        <li
                          key={pocket.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Badge
                            variant="outline"
                            className={
                              pocket.ledgerStatus === "active"
                                ? ""
                                : "text-muted-foreground"
                            }
                          >
                            {pocket.ledgerName}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate">
                            {accountName(pocket)}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatAmount(pocket.balance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RealAccountDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && (
        <RealAccountDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          realAccount={editing}
        />
      )}
    </div>
  );
}
