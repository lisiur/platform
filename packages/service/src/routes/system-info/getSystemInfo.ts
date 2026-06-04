import fs from "node:fs";
import os from "node:os";
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { prepend } from "#utils/list";
import { systemInfoSchema } from "./schema";

function sampleCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      total += cpu.times[type as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

async function getCpuUsage(): Promise<number> {
  const start = sampleCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const end = sampleCpuTimes();
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  if (totalDiff === 0) return 0;
  const used = 100 - (idleDiff / totalDiff) * 100;
  return Math.round(used * 10) / 10;
}

function getMemoryInfo(): {
  total: number;
  used: number;
  usedPercent: number;
} {
  const total = os.totalmem();
  const platform = process.platform;

  if (platform === "darwin") {
    try {
      const { execSync } = require("node:child_process");
      const vmStat = execSync("vm_stat", { encoding: "utf-8" });
      const psMatch = vmStat.match(/page size of (\d+) bytes/);
      const pageSize = psMatch ? Number.parseInt(psMatch[1], 10) : 4096;
      const vals: Record<string, number> = {};
      for (const line of vmStat.split("\n")) {
        const m = line.match(/Pages\s+(.+?):\s+(\d+)/);
        if (m) vals[m[1].trim()] = Number.parseInt(m[2], 10);
      }
      const used =
        (vals["wired down"] +
          vals.active +
          vals.speculative +
          vals["stored in compressor"]) *
        pageSize;
      const usedPercent = Math.round((used / total) * 1000) / 10;
      return { total, used, usedPercent };
    } catch {
      // fallback
    }
  }

  if (platform === "linux") {
    try {
      const memInfo = fs.readFileSync("/proc/meminfo", "utf-8");
      const getValue = (key: string) => {
        const match = memInfo.match(new RegExp(`${key}:\\s+(\\d+)`));
        return match ? Number.parseInt(match[1], 10) * 1024 : 0;
      };
      const available = getValue("MemAvailable");
      if (available > 0) {
        const used = total - available;
        const usedPercent = Math.round((used / total) * 1000) / 10;
        return { total, used, usedPercent };
      }
    } catch {
      // fallback
    }
  }

  // fallback: os.freemem()
  const used = total - os.freemem();
  const usedPercent = Math.round((used / total) * 1000) / 10;
  return { total, used, usedPercent };
}

function getStorageInfo(): {
  total: number;
  used: number;
  usedPercent: number;
} {
  if (process.platform === "darwin") {
    try {
      const { execSync } = require("node:child_process");
      const output = execSync("diskutil apfs list", { encoding: "utf-8" });
      const sizes = [
        ...output.matchAll(/Size \(Capacity Ceiling\):\s+([\d,]+)\s*B/g),
      ];
      const useds = [
        ...output.matchAll(/Capacity In Use By Volumes:\s+([\d,]+)\s*B/g),
      ];
      let bestTotal = 0;
      let bestUsed = 0;
      for (let i = 0; i < sizes.length; i++) {
        const total = Number.parseInt(sizes[i][1].replace(/,/g, ""), 10);
        const used = Number.parseInt(
          (useds[i]?.[1] ?? "0").replace(/,/g, ""),
          10,
        );
        if (total > bestTotal) {
          bestTotal = total;
          bestUsed = used;
        }
      }
      if (bestTotal > 0) {
        const usedPercent = Math.round((bestUsed / bestTotal) * 1000) / 10;
        return { total: bestTotal, used: bestUsed, usedPercent };
      }
    } catch {
      // fallback
    }
  }

  const path = process.platform === "win32" ? "C:\\" : "/";
  const stats = fs.statfsSync(path);
  const total = stats.blocks * stats.bsize;
  const available = stats.bavail * stats.bsize;
  const used = total - available;
  const usedPercent = Math.round((used / total) * 1000) / 10;
  return { total, used, usedPercent };
}

let lastCpuTime: { user: number; system: number } | null = null;
let lastCpuTimestamp: number | null = null;

function getProcessCpuUsage(): number {
  const usage = process.cpuUsage();
  const now = performance.now();
  const userUs = usage.user;
  const sysUs = usage.system;
  const totalUs = userUs + sysUs;

  if (lastCpuTime && lastCpuTimestamp) {
    const deltaUs = totalUs - (lastCpuTime.user + lastCpuTime.system);
    const deltaMs = now - lastCpuTimestamp;
    if (deltaMs > 0) {
      const pct = (deltaUs / 1000 / deltaMs) * 100;
      lastCpuTime = { user: userUs, system: sysUs };
      lastCpuTimestamp = now;
      return Math.round(pct * 10) / 10;
    }
  }

  lastCpuTime = { user: userUs, system: sysUs };
  lastCpuTimestamp = now;
  return 0;
}

export const getSystemInfo = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("system-info::view")),
    method: "get",
    path: "/",
    tags: ["SystemInfo"],
    summary: "Get system resource info",
    description: "Returns current CPU, memory, and storage usage information.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(systemInfoSchema, "System resource information"),
    },
  }),
  handler: async (c) => {
    const cpuUsage = await getCpuUsage();
    const cpus = os.cpus();
    const memory = getMemoryInfo();

    const storage = getStorageInfo();

    const mem = process.memoryUsage();
    const processCpu = getProcessCpuUsage();
    const totalMem = os.totalmem();

    return c.json(
      {
        cpu: {
          usage: cpuUsage,
          cores: cpus.length,
          model: cpus[0]?.model ?? "Unknown",
        },
        memory,
        storage,
        process: {
          cpu: processCpu,
          memory: mem.rss,
          memoryPercent: Math.round((mem.rss / totalMem) * 1000) / 10,
          uptime: Math.floor(process.uptime()),
        },
      },
      200,
    );
  },
});
