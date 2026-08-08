"use client";

import { APP_BUILD_TIME, APP_GIT_SHA, APP_VERSION } from "@repo/shared";
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ClientResponse } from "hono/client";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEventStream } from "../hooks/use-event-stream";
import { toast } from "../lib/toast";

// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client methods are overloaded and app-generated.
type ApiMethod = (...args: any[]) => Promise<ClientResponse<any, any, any>>;

export interface VersionAppClient {
  api: {
    version: {
      latest: { $get: ApiMethod };
      update: {
        $post: ApiMethod;
        cancel: { $post: ApiMethod };
        status: { $get: ApiMethod };
      };
    };
  };
}

export interface VersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appClient: VersionAppClient;
  apiOrigin: string;
  appCode: string;
  canViewVersion?: boolean;
  canManageVersion?: boolean;
}

export interface LatestRelease {
  tag: string;
  name: string | null;
  htmlUrl: string;
  publishedAt: string;
  tarballUrl: string;
  tarballSize: number;
  newer: boolean;
}

export interface UpdateStatus {
  phase: "idle" | "running" | "succeeded" | "failed" | "cancelled";
  step: string;
  message: string;
  targetTag: string | null;
  mode: UpdateMode | null;
  progress: {
    downloadedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  } | null;
  startedAt: string | null;
  updatedAt: string | null;
}

type UpdateMode = "update" | "redeploy";

async function readJson(res: ClientResponse<unknown, number, string>) {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401 || res.status === 403) {
      if (body.message?.includes("Self-update is disabled")) {
        throw new StatusError(res.status, body.message);
      }
      throw new StatusError(res.status, "permissionDenied");
    }
    throw new StatusError(res.status, body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

class StatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function VersionDialog({
  open,
  onOpenChange,
  appClient,
  apiOrigin,
  appCode,
  canViewVersion = false,
  canManageVersion = false,
}: VersionDialogProps) {
  const t = useTranslations("Frontend.version");
  const canCheckVersion = canViewVersion || canManageVersion;
  const formatErrorMessage = (err: unknown) => {
    if (err instanceof StatusError) {
      if (err.message === "permissionDenied") return t("permissionDenied");
      if (err.message.includes("Self-update is disabled")) {
        return t("selfUpdateDisabled");
      }
      if (err.message.includes("DEPLOY_ROOT")) return t("deployRootRequired");
    }
    return err instanceof Error ? err.message : String(err);
  };
  const formatStatusStep = useCallback(
    (step: string) => {
      switch (step) {
        case "queued":
        case "downloading":
        case "verifying":
        case "forking":
        case "stopping":
        case "extracting":
        case "installing":
        case "migrating":
        case "resetting":
        case "reloading":
        case "starting":
        case "saving":
        case "done":
        case "error":
        case "cancelled":
          return t(`statusSteps.${step}`);
        default:
          return step;
      }
    },
    [t],
  );
  const formatStatusMessage = useCallback(
    (s: UpdateStatus) => {
      const target = s.targetTag ?? t("latest");
      switch (s.step) {
        case "queued":
          return s.mode === "redeploy"
            ? t("statusMessages.queuedRedeploy", { target })
            : t("statusMessages.queuedUpdate", { target });
        case "downloading": {
          if (!s.progress) return t("statusMessages.downloading", { target });
          const downloaded = formatBytes(s.progress.downloadedBytes);
          if (!s.progress.totalBytes || s.progress.percent === null) {
            return t("statusMessages.downloadingBytes", {
              target,
              downloaded,
            });
          }
          return t("statusMessages.downloadingProgress", {
            target,
            downloaded,
            total: formatBytes(s.progress.totalBytes),
            percent: s.progress.percent,
          });
        }
        case "verifying":
        case "stopping":
        case "extracting":
        case "installing":
        case "migrating":
        case "resetting":
        case "reloading":
        case "starting":
        case "saving":
          return t(`statusMessages.${s.step}`);
        case "cancelled":
          return t("statusMessages.cancelled");
        case "done":
          return s.mode === "redeploy"
            ? t("statusMessages.doneRedeploy", { target })
            : t("statusMessages.doneUpdate", { target });
        default:
          return s.message;
      }
    },
    [t],
  );
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [mode, setMode] = useState<UpdateMode>("update");
  const prevPhaseRef = useRef<string | null>(null);

  const latestQuery = useQuery({
    queryKey: ["version", "latest"],
    queryFn: async () => {
      const res = await appClient.api.version.latest.$get();
      return (await readJson(res)) as LatestRelease;
    },
    enabled: open && canCheckVersion,
    retry: false,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await appClient.api.version.update.$post({ json: { mode } });
      return readJson(res);
    },
    onMutate: () => {
      setStatus(null);
      prevPhaseRef.current = null;
    },
    onError: (err: unknown) => {
      toast.error(formatErrorMessage(err));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await appClient.api.version.update.cancel.$post();
      return readJson(res);
    },
    onError: (err: unknown) => {
      toast.error(formatErrorMessage(err));
    },
  });

  const fetchStatus = useCallback(async () => {
    if (!canCheckVersion) return null;
    try {
      const res = await appClient.api.version.update.status.$get();
      const s = (await readJson(res)) as UpdateStatus;
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, [appClient, canCheckVersion]);

  const sseConnection = useEventStream({
    origin: apiOrigin,
    appCode,
    event: "self_update.status.updated",
    enabled: open && canCheckVersion,
    handler: (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as UpdateStatus & {
          type: string;
          target: string;
        };
        setStatus(data);
      } catch {
        // ignore parse errors
      }
    },
  });

  useEffect(() => {
    if (!open) {
      setStatus(null);
      prevPhaseRef.current = null;
      return;
    }
    void fetchStatus();
  }, [open, fetchStatus]);

  useEffect(() => {
    if (!status) return;
    const phase = status.phase;
    if (prevPhaseRef.current === "running" && phase !== "running") {
      if (phase === "succeeded") {
        toast.success(t("succeeded"));
        setTimeout(() => window.location.reload(), 1500);
      } else if (phase === "failed") {
        toast.error(`${t("failed")}: ${formatStatusMessage(status)}`);
      } else if (phase === "cancelled") {
        toast.info(t("cancelled"));
      }
    }
    prevPhaseRef.current = phase;
  }, [status, t, formatStatusMessage]);

  // SSE is the primary progress channel. The HTTP poll is a fallback that runs
  // ONLY while the SSE stream is disconnected (e.g. during a redeploy's gateway
  // restart) — so it fires for just a few seconds instead of the whole update,
  // avoiding continuous rate-limited requests.
  const reconnecting =
    sseConnection !== "open" &&
    canCheckVersion &&
    (applyMutation.isPending || status?.phase === "running");
  const pollingEnabled = open && reconnecting;
  useEffect(() => {
    if (!pollingEnabled) return;
    const id = setInterval(() => {
      void fetchStatus();
    }, 2000);
    return () => clearInterval(id);
  }, [pollingEnabled, fetchStatus]);

  // Resync current status whenever the SSE stream (re)connects. This is the
  // fix for the redeploy gateway-restart case: the daemon may reach a terminal
  // phase while the gateway (and thus the SSE bridge) is down, so no live event
  // would ever deliver that terminal status. Pulling /status on reconnect
  // guarantees the UI reflects the true current state.
  useEffect(() => {
    if (sseConnection === "open") {
      void fetchStatus();
    }
  }, [sseConnection, fetchStatus]);

  const latest = latestQuery.data;
  const checking = latestQuery.isLoading || latestQuery.isFetching;
  const hasNewer = !!latest?.newer;
  const canApply = !!latest && (hasNewer || mode === "redeploy");
  const updating = status?.phase === "running" || applyMutation.isPending;
  const canCancel =
    status?.phase === "running" && status?.step === "downloading";
  const isSelfUpdateDisabled =
    latestQuery.error instanceof StatusError &&
    latestQuery.error.message.includes("Self-update is disabled");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t("currentVersion")}
              </span>
              <span className="font-mono font-medium text-sm">
                {APP_VERSION}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t("gitSha")}
              </span>
              <span className="font-mono text-muted-foreground text-sm">
                {APP_GIT_SHA.slice(0, 7)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t("builtAt")}
              </span>
              <span className="font-mono text-muted-foreground text-xs">
                {new Date(APP_BUILD_TIME).toLocaleString()}
              </span>
            </div>
          </div>

          {canCheckVersion && checking ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("checking")}
            </div>
          ) : canCheckVersion && latestQuery.error ? (
            <p
              className={
                isSelfUpdateDisabled
                  ? "text-muted-foreground text-sm"
                  : "text-destructive text-sm"
              }
            >
              {formatErrorMessage(latestQuery.error)}
            </p>
          ) : canCheckVersion && latest ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                {hasNewer ? (
                  <ArrowUpCircle className="h-4 w-4 text-primary" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                <span className="text-sm font-medium">
                  {hasNewer ? t("available") : t("upToDate")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {t("latest")}
                </span>
                <span className="font-mono text-sm">{latest.tag}</span>
              </div>
              <a
                href={latest.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary text-xs hover:underline"
              >
                {t("viewRelease")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : null}

          {canCheckVersion && updating ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {(status?.mode ?? mode) === "redeploy"
                  ? t("redeploying")
                  : t("updating")}
              </div>
              {status ? (
                <p className="text-muted-foreground text-xs">
                  {formatStatusStep(status.step)}: {formatStatusMessage(status)}
                </p>
              ) : null}
              {reconnecting ? (
                <p className="flex items-center gap-1.5 text-amber-600 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("reconnecting")}
                </p>
              ) : null}
              {canCancel ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {t("cancelDownload")}
                </Button>
              ) : null}
            </div>
          ) : canCheckVersion && status?.phase === "cancelled" ? (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-muted-foreground text-sm">{t("cancelled")}</p>
            </div>
          ) : null}
          {canManageVersion && !isSelfUpdateDisabled ? (
            <label className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <Checkbox
                checked={mode === "redeploy"}
                onCheckedChange={(checked) =>
                  setMode(checked === true ? "redeploy" : "update")
                }
                disabled={updating}
              />
              <span className="space-y-1">
                <span className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t("redeployMode")}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {t("redeployDescription")}
                </span>
              </span>
            </label>
          ) : null}
        </DialogBody>
        {canCheckVersion && !isSelfUpdateDisabled ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => latestQuery.refetch()}
              disabled={checking || updating}
            >
              <RefreshCw className="h-4 w-4" />
              {t("checkUpdates")}
            </Button>
            {canManageVersion && canApply && !updating ? (
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                variant={mode === "redeploy" ? "destructive" : "default"}
              >
                <ArrowUpCircle className="h-4 w-4" />
                {mode === "redeploy" ? t("redeployNow") : t("updateNow")}
              </Button>
            ) : null}
            {updating ? (
              <Button onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4" />
                {t("reload")}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
