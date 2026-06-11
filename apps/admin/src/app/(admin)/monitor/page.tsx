"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@/components/ui/progress";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface SystemInfo {
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; usedPercent: number };
  storage: { total: number; used: number; usedPercent: number };
  process: {
    cpu: number;
    memory: number;
    memoryPercent: number;
    uptime: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1000));
  return `${(bytes / 1000 ** i).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-yellow-500";
  return "bg-primary";
}

function ResourceCard({
  icon: Icon,
  title,
  description,
  percent,
  detail,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  percent: number;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-muted-foreground" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProgressPrimitive.Root value={percent} className="flex flex-col gap-1">
          <div className="flex items-center">
            <ProgressLabel>{title}</ProgressLabel>
            <ProgressValue>{() => `${percent.toFixed(1)}%`}</ProgressValue>
          </div>
          <ProgressTrack>
            <ProgressIndicator
              className={getUsageColor(percent)}
              style={{ width: `${percent}%` }}
            />
          </ProgressTrack>
        </ProgressPrimitive.Root>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await withApiFeedback(appClient.api["system-info"].$get)();
      const data = await res.json();
      setInfo(data as SystemInfo);
    } catch {
      // Error handled silently
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 10000);
    return () => clearInterval(interval);
  }, [fetchInfo]);

  if (!info) {
    return (
      <div className="py-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="size-5 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-2 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <h1 className="mb-6 text-2xl font-semibold">System Resources</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ResourceCard
          icon={Cpu}
          title="CPU"
          description={info.cpu.model}
          percent={info.cpu.usage}
          detail={`${info.cpu.usage.toFixed(1)}% · ${info.cpu.cores} cores`}
        />
        <ResourceCard
          icon={MemoryStick}
          title="Memory"
          description={`Total ${formatBytes(info.memory.total)}`}
          percent={info.memory.usedPercent}
          detail={`${formatBytes(info.memory.used)} / ${formatBytes(info.memory.total)}`}
        />
        <ResourceCard
          icon={HardDrive}
          title="Storage"
          description={`Total ${formatBytes(info.storage.total)}`}
          percent={info.storage.usedPercent}
          detail={`${formatBytes(info.storage.used)} / ${formatBytes(info.storage.total)}`}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="size-5 text-muted-foreground" />
              <CardTitle>Node Process</CardTitle>
            </div>
            <CardDescription>
              Uptime {formatUptime(info.process.uptime)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProgressPrimitive.Root
              value={info.process.cpu}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between text-sm">
                <ProgressLabel>CPU</ProgressLabel>
                <ProgressValue>
                  {() => `${info.process.cpu.toFixed(1)}%`}
                </ProgressValue>
              </div>
              <ProgressTrack>
                <ProgressIndicator
                  className={getUsageColor(info.process.cpu)}
                  style={{ width: `${Math.min(info.process.cpu, 100)}%` }}
                />
              </ProgressTrack>
            </ProgressPrimitive.Root>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Memory</span>
                <span className="text-muted-foreground">
                  {formatBytes(info.process.memory)}
                </span>
              </div>
              <div className="relative flex h-1 w-full items-center overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min((info.process.memory / info.memory.total) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
