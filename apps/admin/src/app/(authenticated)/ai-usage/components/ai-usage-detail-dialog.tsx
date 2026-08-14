"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatDateTime } from "@/utils/date";
import { formatDuration } from "@/utils/format";
import type { AiUsageEventEntry } from "./ai-usage-table";

interface AiUsageDetailDialogProps {
  open: boolean;
  event: AiUsageEventEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function AiUsageDetailDialog({
  open,
  event,
  onOpenChange,
}: AiUsageDetailDialogProps) {
  const t = useTranslations("AiUsage");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {event ? (
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <DetailRow
                label={t("columns.id")}
                value={event.id}
                mono
                colSpan={2}
              />
              <DetailRow
                label={t("columns.status")}
                value={
                  <Badge
                    variant={event.status === "ok" ? "secondary" : "outline"}
                  >
                    {event.status}
                  </Badge>
                }
              />
              <DetailRow
                label={t("columns.user")}
                value={
                  event.user?.name || event.user?.email || event.userId || "-"
                }
              />
              <DetailRow
                label={t("columns.agent")}
                value={event.agent?.name || event.agentId || "-"}
              />
              <DetailRow
                label={t("columns.model")}
                value={event.model?.displayName || event.model?.modelId || "-"}
              />
              <DetailRow
                label={t("columns.account")}
                value={event.account?.name || "-"}
              />
              <DetailRow
                label={t("columns.inputTokens")}
                value={formatNumber(event.inputTokens)}
              />
              <DetailRow
                label={t("columns.cachedInputTokens")}
                value={formatNumber(event.cachedInputTokens)}
              />
              <DetailRow
                label={t("columns.outputTokens")}
                value={formatNumber(event.outputTokens)}
              />
              <DetailRow
                label={t("columns.reasoningTokens")}
                value={formatNumber(event.reasoningTokens)}
              />
              <DetailRow
                label={t("columns.cost")}
                value={`${event.cost.toFixed(6)} ${event.currency}`}
              />
              <DetailRow
                label={t("columns.latencyMs")}
                value={
                  event.latencyMs != null
                    ? formatDuration(event.latencyMs)
                    : "-"
                }
              />
              <DetailRow
                label={t("columns.userId")}
                value={event.userId || "-"}
                mono
              />
              <DetailRow
                label={t("columns.agentId")}
                value={event.agentId || "-"}
                mono
              />
              <DetailRow
                label={t("columns.modelId")}
                value={event.modelId}
                mono
              />
              <DetailRow
                label={t("columns.accountId")}
                value={event.accountId}
                mono
              />
              <DetailRow
                label={t("columns.createdAt")}
                value={formatDateTime(event.createdAt)}
                colSpan={3}
              />
            </dl>
          ) : (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function DetailRow({
  label,
  value,
  mono,
  colSpan,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  colSpan?: number;
}) {
  return (
    <>
      <dt
        className={
          colSpan === 2
            ? "text-muted-foreground"
            : "text-muted-foreground col-span-3 sm:col-span-1"
        }
      >
        {label}
      </dt>
      <dd
        className={`break-all ${mono ? "font-mono text-xs" : ""} ${
          colSpan === 2 ? "col-span-2" : "col-span-3 sm:col-span-2"
        }`}
      >
        {value}
      </dd>
    </>
  );
}
