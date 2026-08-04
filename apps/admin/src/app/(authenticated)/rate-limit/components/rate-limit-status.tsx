"use client";

import { useEventStream } from "@repo/frontend";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenuItem,
  Skeleton,
  Switch,
  Table,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, RefreshCw, TimerReset, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { API_ORIGIN, APP_CODE, appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { formatDuration } from "@/utils/format";

interface Bucket {
  limiter: string;
  subject: string;
  count: number;
  max: number | null;
  remaining: number | null;
  bypass: boolean;
  blocked: boolean;
  resetAt: string;
}

interface StatusResponse {
  blockedCount: number;
  buckets: Bucket[];
}

interface LimiterConfig {
  name: string;
  max: number;
  windowMs: number;
}

const LIMITER_OPTIONS = ["all", "global", "auth"] as const;

function SubjectCell({ subject }: { subject: string }) {
  if (subject.startsWith("ip:")) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Network className="h-3.5 w-3.5 text-muted-foreground" />
        {subject.slice(3)}
      </span>
    );
  }
  if (subject.startsWith("user:")) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        {subject.slice(5)}
      </span>
    );
  }
  return <>{subject}</>;
}

export function RateLimitStatus() {
  const t = useTranslations("RateLimit.status");
  const queryClient = useQueryClient();
  const [limiterFilter, setLimiterFilter] = useState<string>("all");
  const [blockedOnly, setBlockedOnly] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["rate-limit-status", limiterFilter, blockedOnly],
    queryFn: async () => {
      const res = await appClient.api["rate-limit"].status.$get({
        query: {
          limiter: limiterFilter === "all" ? undefined : limiterFilter,
          blocked: blockedOnly ? true : undefined,
        },
      });
      return (await res.json()) as StatusResponse;
    },
  });

  const { data: limiters } = useQuery({
    queryKey: ["rate-limit-settings"],
    queryFn: async () => {
      const res = await appClient.api["rate-limit"].settings.$get();
      return (await res.json()) as LimiterConfig[];
    },
  });

  useEventStream({
    origin: API_ORIGIN,
    appCode: APP_CODE,
    event: "rate_limit.updated",
    handler: () => {
      void queryClient.invalidateQueries({ queryKey: ["rate-limit-status"] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (bucket: Bucket) => {
      await withApiFeedback(appClient.api["rate-limit"].release.$post)({
        json: { subject: bucket.subject, limiter: bucket.limiter },
      });
    },
    onSuccess: () => {
      toast.success(t("releaseSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["rate-limit-status"] });
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={limiterFilter}
          onChange={(e) => setLimiterFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        >
          {LIMITER_OPTIONS.map((name) => (
            <option key={name} value={name}>
              {name === "all" ? t("allLimiters") : name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={blockedOnly}
            onCheckedChange={(v) => setBlockedOnly(v === true)}
          />
          {t("blockedOnly")}
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          {t("refresh")}
        </Button>
        {data && (
          <Badge variant={data.blockedCount > 0 ? "destructive" : "secondary"}>
            {t("blockedSummary", { count: data.blockedCount })}
          </Badge>
        )}
      </div>

      {limiters && limiters.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {limiters.map((l) => (
            <Card key={l.name} size="sm" className="basis-48 flex-1">
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {t("limiter")}
                    </div>
                    <div className="truncate text-sm font-semibold">
                      {l.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">
                      {t("policy")}
                    </div>
                    <div className="font-mono text-sm">
                      {l.max} / {formatDuration(l.windowMs)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-lg border">
        <Table>
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("subject")}</TableHead>
              <TableHead>{t("limiter")}</TableHead>
              <TableHead>{t("count")}</TableHead>
              <TableHead>{t("limit")}</TableHead>
              <TableHead>{t("remaining")}</TableHead>
              <TableHead>{t("statusLabel")}</TableHead>
              <TableHead>{t("resetAt")}</TableHead>
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : data && data.buckets.length > 0 ? (
              data.buckets.map((bucket) => (
                <TableRow key={`${bucket.limiter}:${bucket.subject}`}>
                  <TableCell className="font-mono text-sm">
                    <SubjectCell subject={bucket.subject} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{bucket.limiter}</Badge>
                  </TableCell>
                  <TableCell>{bucket.count}</TableCell>
                  <TableCell>{bucket.max ?? "∞"}</TableCell>
                  <TableCell>{bucket.remaining ?? "∞"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        bucket.blocked
                          ? "destructive"
                          : bucket.bypass
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {bucket.blocked
                        ? t("blocked")
                        : bucket.bypass
                          ? t("bypass")
                          : t("ok")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(bucket.resetAt)}
                  </TableCell>
                  <TableActionCell
                    menuLabel={t("release")}
                    menu={
                      <DropdownMenuItem
                        disabled={releaseMutation.isPending}
                        onClick={() => releaseMutation.mutate(bucket)}
                      >
                        <TimerReset />
                        {t("release")}
                      </DropdownMenuItem>
                    }
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("release")}
                            disabled={releaseMutation.isPending}
                            onClick={() => releaseMutation.mutate(bucket)}
                          >
                            <TimerReset className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("release")}</TooltipContent>
                    </Tooltip>
                  </TableActionCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t("noBuckets")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
