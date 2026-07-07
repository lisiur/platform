"use client";

import { useEventStream } from "@repo/frontend";
import { Card, CardContent } from "@repo/ui";
import {
  Activity,
  CalendarClock,
  Clock,
  Gauge,
  Hourglass,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { API_ORIGIN, APP_CODE, appClient } from "@/lib/api";
import { formatTimeUntil } from "@/utils/date";

interface ExecutorStats {
  queueSize: number;
  pending: number;
  concurrency: number;
  nextScheduledAt: string | null;
  byStatus: {
    PENDING: number;
    PROCESSING: number;
    COMPLETED: number;
    FAILED: number;
  };
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <Card size="sm" className="gap-0">
      <CardContent className="flex items-center gap-3">
        <span className={tone ?? "text-muted-foreground"}>{icon}</span>
        <div className="flex flex-col">
          <span className="text-2xl leading-none font-semibold tabular-nums whitespace-nowrap">
            {value}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function JobExecutorStats() {
  const t = useTranslations("Jobs");
  const [stats, setStats] = useState<ExecutorStats | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchStats = useCallback(async () => {
    try {
      const res = await appClient.api.jobs.stats.$get();
      if (res.ok) {
        setStats((await res.json()) as ExecutorStats);
      }
    } catch {
      // silent — stats are non-critical background info
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEventStream({
    origin: API_ORIGIN,
    appCode: APP_CODE,
    event: "job.stats.updated",
    handler: () => {
      fetchStats();
      setNow(Date.now());
    },
  });

  const nextScheduledMs = stats?.nextScheduledAt
    ? new Date(stats.nextScheduledAt).getTime()
    : null;
  const needsFastTick =
    nextScheduledMs !== null &&
    nextScheduledMs - now > 0 &&
    nextScheduledMs - now < 3_600_000;

  useEffect(() => {
    if (!needsFastTick) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [needsFastTick]);

  return (
    <div className="mb-6 shrink-0">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        {t("stats.executor")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label={t("status.PENDING")}
          value={stats?.byStatus.PENDING ?? "-"}
          tone="text-muted-foreground"
        />
        <StatCard
          icon={<Gauge className="h-5 w-5" />}
          label={t("stats.concurrency")}
          value={stats?.concurrency ?? "-"}
          tone="text-muted-foreground"
        />
        <StatCard
          icon={<Zap className="h-5 w-5" />}
          label={t("status.PROCESSING")}
          value={stats?.byStatus.PROCESSING ?? "-"}
          tone="text-blue-500"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label={t("stats.active")}
          value={stats?.pending ?? "-"}
          tone="text-blue-500"
        />
        <StatCard
          icon={<Hourglass className="h-5 w-5" />}
          label={t("stats.queued")}
          value={stats?.queueSize ?? "-"}
          tone="text-amber-500"
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label={t("stats.nextExecution")}
          value={
            stats?.nextScheduledAt
              ? formatTimeUntil(stats.nextScheduledAt)
              : "-"
          }
          tone="text-muted-foreground"
        />
      </div>
    </div>
  );
}
