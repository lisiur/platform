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
}

type UpdateMode = "update" | "redeploy";

async function readJson(res: ClientResponse<unknown, number, string>) {
  if (res.status === 401 || res.status === 403) {
    throw new StatusError(res.status, "permissionDenied");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
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

export function VersionDialog({
  open,
  onOpenChange,
  appClient,
  canManageVersion = false,
}: VersionDialogProps) {
  const t = useTranslations("Frontend.version");
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [mode, setMode] = useState<UpdateMode>("update");

  const latestQuery = useQuery({
    queryKey: ["version", "latest"],
    queryFn: async () => {
      const res = await appClient.api.version.latest.$get();
      return (await readJson(res)) as LatestRelease;
    },
    enabled: open && canManageVersion,
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
      const msg =
        err instanceof StatusError ? t(err.message) : (err as Error).message;
      toast.error(msg);
    },
  });

  const fetchStatus = useCallback(async () => {
    if (!canManageVersion) return null;
    try {
      const res = await appClient.api.version.update.status.$get();
      const s = (await readJson(res)) as UpdateStatus;
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, [appClient, canManageVersion]);

  useEffect(() => {
    if (!canManageVersion || !polling) return;
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
          toast.error(`${t("failed")}: ${s.message}`);
        }
        return;
      }
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [polling, fetchStatus, t, canManageVersion]);

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
                {APP_GIT_SHA}
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

          {canManageVersion && checking ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("checking")}
            </div>
          ) : canManageVersion && latestQuery.error ? (
            <p className="text-destructive text-sm">
              {latestQuery.error instanceof StatusError
                ? t(latestQuery.error.message)
                : (latestQuery.error as Error).message}
            </p>
          ) : canManageVersion && latest ? (
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

          {canManageVersion && updating && status ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {status.mode === "redeploy" ? t("redeploying") : t("updating")}
              </div>
              <p className="text-muted-foreground text-xs">
                {status.step}: {status.message}
              </p>
            </div>
          ) : null}
          {canManageVersion ? (
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
        {canManageVersion ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => latestQuery.refetch()}
              disabled={checking || updating}
            >
              <RefreshCw className="h-4 w-4" />
              {t("checkUpdates")}
            </Button>
            {canApply && !updating ? (
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
