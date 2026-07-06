"use client";

import { Card, CardContent } from "@repo/ui";
import {
  Activity,
  CheckCircle2,
  Clock,
  Gauge,
  Hourglass,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { appClient } from "@/lib/api";

interface ExecutorStats {
  queueSize: number;
  pending: number;
  concurrency: number;
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
          <span className="text-2xl leading-none font-semibold tabular-nums">
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
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return (
    <div className="mb-6 shrink-0">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        {t("stats.executor")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <StatCard
          icon={<Hourglass className="h-5 w-5" />}
          label={t("stats.queued")}
          value={stats?.queueSize ?? "-"}
          tone="text-amber-500"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label={t("stats.active")}
          value={stats?.pending ?? "-"}
          tone="text-blue-500"
        />
        <StatCard
          icon={<Gauge className="h-5 w-5" />}
          label={t("stats.concurrency")}
          value={stats?.concurrency ?? "-"}
          tone="text-muted-foreground"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label={t("status.PENDING")}
          value={stats?.byStatus.PENDING ?? "-"}
          tone="text-muted-foreground"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label={t("status.PROCESSING")}
          value={stats?.byStatus.PROCESSING ?? "-"}
          tone="text-blue-500"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label={t("status.COMPLETED")}
          value={stats?.byStatus.COMPLETED ?? "-"}
          tone="text-green-500"
        />
        <StatCard
          icon={<XCircle className="h-5 w-5" />}
          label={t("status.FAILED")}
          value={stats?.byStatus.FAILED ?? "-"}
          tone="text-red-500"
        />
      </div>
    </div>
  );
}
