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
import { useCallback, useEffect, useState } from "react";
import { toast } from "../lib/toast";

// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client methods are overloaded and app-generated.
type ApiMethod = (...args: any[]) => Promise<ClientResponse<any, any, any>>;

export interface VersionAppClient {
  api: {
    version: {
      latest: { $get: ApiMethod };
      update: {
        $post: ApiMethod;
        status: { $get: ApiMethod };
      };
    };
  };
}

export interface VersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appClient: VersionAppClient;
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
  phase: "idle" | "running" | "succeeded" | "failed";
  step: string;
  message: string;
  targetTag: string | null;
  mode: UpdateMode | null;
  progress: {
    downloadedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  } | null;
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
  const [polling, setPolling] = useState(false);
  const [mode, setMode] = useState<UpdateMode>("update");

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
    onSuccess: () => {
      setPolling(true);
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

  useEffect(() => {
    if (!canCheckVersion || !polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const s = await fetchStatus();
      if (cancelled) return;
      if (!s || s.phase === "running") {
        timer = setTimeout(tick, 1500);
        return;
      }
      if (
        s.phase === "idle" ||
        s.phase === "succeeded" ||
        s.phase === "failed"
      ) {
        setPolling(false);
        if (s.phase === "succeeded") {
          toast.success(t("succeeded"));
          setTimeout(() => window.location.reload(), 1500);
        } else if (s.phase === "failed") {
          toast.error(`${t("failed")}: ${formatStatusMessage(s)}`);
        }
        return;
      }
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [polling, fetchStatus, t, canCheckVersion, formatStatusMessage]);

  useEffect(() => {
    if (!open) {
      setPolling(false);
      setStatus(null);
      return;
    }
    void fetchStatus().then((s) => {
      if (s?.phase === "running") setPolling(true);
    });
  }, [open, fetchStatus]);

  const latest = latestQuery.data;
  const checking = latestQuery.isLoading;
  const hasNewer = !!latest?.newer;
  const canApply = !!latest && (hasNewer || mode === "redeploy");
  const updating = status?.phase === "running" || applyMutation.isPending;
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

          {canCheckVersion && updating && status ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {status.mode === "redeploy" ? t("redeploying") : t("updating")}
              </div>
              <p className="text-muted-foreground text-xs">
                {formatStatusStep(status.step)}: {formatStatusMessage(status)}
              </p>
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
