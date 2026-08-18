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
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { formatDateTime } from "@/utils/date";
import { formatDuration } from "@/utils/format";
import type { AiUsageEventEntry } from "./ai-usage-table";

interface AiUsageEventInputContent {
  systemPrompt?: string | null;
  prompt: string;
  params?: Record<string, unknown> | null;
}

interface AiUsageEventOutputContent {
  text: string;
  finishReason: string;
}

export interface AiUsageEventDetail extends AiUsageEventEntry {
  input: AiUsageEventInputContent | null;
  output: AiUsageEventOutputContent | null;
  error: string | null;
}

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
  const [detail, setDetail] = useState<AiUsageEventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open || !event) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setLoadError(false);
    appClient.api.ai["usage-events"][":id"]
      .$get({ param: { id: event.id } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = (await res.json()) as AiUsageEventDetail;
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          toast.error(t("loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, event, t]);

  const hasContent = detail && (detail.input || detail.output || detail.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {event ? (
            <>
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
                  value={
                    event.model?.displayName || event.model?.modelId || "-"
                  }
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
              <div className="mt-4 border-t pt-4">
                <h4 className="mb-2 text-sm font-medium">
                  {t("message.title")}
                </h4>
                {loading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : loadError ? (
                  <p className="text-sm text-destructive">{t("loadFailed")}</p>
                ) : hasContent ? (
                  <div className="flex flex-col gap-3">
                    {detail?.input?.systemPrompt ? (
                      <ContentBlock label={t("message.systemPrompt")}>
                        {detail.input.systemPrompt}
                      </ContentBlock>
                    ) : null}
                    {detail?.input ? (
                      <ContentBlock label={t("message.prompt")}>
                        {detail.input.prompt}
                      </ContentBlock>
                    ) : null}
                    {detail?.input?.params &&
                    Object.keys(detail.input.params).length > 0 ? (
                      <ContentBlock label={t("message.params")}>
                        {JSON.stringify(detail.input.params, null, 2)}
                      </ContentBlock>
                    ) : null}
                    {detail?.output ? (
                      <ContentBlock
                        label={t("message.output")}
                        caption={`${t("message.finishReason")}: ${detail.output.finishReason}`}
                      >
                        {detail.output.text}
                      </ContentBlock>
                    ) : null}
                    {detail?.error ? (
                      <ContentBlock label={t("message.error")} destructive>
                        {detail.error}
                      </ContentBlock>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("message.noContent")}
                  </p>
                )}
              </div>
            </>
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

function ContentBlock({
  label,
  caption,
  destructive,
  children,
}: {
  label: string;
  caption?: string;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {caption ? (
          <span className="text-xs text-muted-foreground">{caption}</span>
        ) : null}
      </div>
      <pre
        className={`max-h-48 overflow-auto rounded-md border p-2 font-mono text-xs whitespace-pre-wrap break-all ${
          destructive
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "bg-muted/50"
        }`}
      >
        {children}
      </pre>
    </div>
  );
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
