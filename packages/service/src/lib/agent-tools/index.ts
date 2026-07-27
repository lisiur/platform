import os from "node:os";
import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { jobRepository } from "#repositories/job.repository";
import { jobInstanceRepository } from "#repositories/job-instance.repository";
import { getCacheStats, getEntry, listKeys } from "#services/cache.service";
import { getRateLimitStatus } from "#services/rate-limit.service";
import { jobExecutor } from "#states";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

/** Serializes a (possibly null) Prisma DateTime to an ISO string so tool
 * outputs stay JSON-safe — the AI SDK validates model-message tool results
 * against `jsonValueSchema`, which rejects `Date` instances. */
function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Read-only platform introspection tools for the AI Agent.
 *
 * These tools give the agent visibility into the running platform (job queue,
 * cache, rate limiter, system health) without granting any filesystem or shell
 * access. They call existing services/repositories directly.
 *
 * Return values are plain JSON objects; the AI SDK handles serialisation for
 * both the model and the client UI.
 */
export const platformTools: ToolSet = {
  platform_overview: tool({
    description:
      "Get a high-level snapshot of platform health: job queue runtime stats, " +
      "job instance counts by status, cache usage, and currently blocked rate-limit subjects. " +
      "Use this first to understand the current state of the system.",
    inputSchema: z.object({}),
    execute: async () => {
      const [runtimeStats, statusCounts, cacheStats, rateLimit] =
        await Promise.all([
          Promise.resolve(jobExecutor.getStats()),
          jobInstanceRepository.countByStatus(),
          Promise.resolve(getCacheStats()),
          Promise.resolve(getRateLimitStatus({ blockedOnly: true })),
        ]);

      const memTotal = os.totalmem();
      const memFree = os.freemem();

      return {
        jobs: {
          runtime: runtimeStats,
          instancesByStatus: statusCounts,
        },
        cache: {
          totalKeys: cacheStats.totalKeys,
          maxSize: cacheStats.maxSize,
          namespaces: cacheStats.namespaces,
        },
        rateLimit: {
          blockedSubjects: rateLimit.blockedCount,
        },
        system: {
          memoryTotal: formatBytes(memTotal),
          memoryUsed: formatBytes(memTotal - memFree),
          memoryUsedPercent: `${(((memTotal - memFree) / memTotal) * 100).toFixed(1)}%`,
          cpuCores: os.cpus().length,
          uptimeSeconds: Math.floor(os.uptime()),
          processUptimeSeconds: Math.floor(process.uptime()),
        },
      };
    },
  }),

  list_jobs: tool({
    description:
      "List job templates (recurring or manual-trigger definitions). " +
      "Optionally filter by handler type or enabled state. Returns name, type, " +
      "cron expression, enabled flag, and next scheduled run.",
    inputSchema: z.object({
      type: z
        .string()
        .optional()
        .describe("Filter by handler type, e.g. 'send-notification'."),
      enabled: z.boolean().optional().describe("Filter by enabled state."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results (default 20)."),
    }),
    execute: async ({ type, enabled, limit }) => {
      const { jobs, total } = await jobRepository.findMany({
        type,
        enabled,
        limit: limit ?? 20,
      });
      return {
        total,
        jobs: jobs.map((j) => ({
          id: j.id,
          name: j.name,
          type: j.type,
          cronExpression: j.cronExpression,
          enabled: j.enabled,
          nextRunAt: toIso(j.nextRunAt),
          lastRunAt: toIso(j.lastRunAt),
        })),
      };
    },
  }),

  list_job_instances: tool({
    description:
      "List job instances (individual executions). Optionally filter by status " +
      "(PENDING, PROCESSING, COMPLETED, FAILED), handler type, or parent job id. " +
      "Useful for investigating failures or monitoring in-flight work.",
    inputSchema: z.object({
      status: z
        .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"])
        .optional()
        .describe("Filter by lifecycle status."),
      type: z.string().optional().describe("Filter by handler type."),
      jobId: z
        .string()
        .optional()
        .describe("Filter by parent job template id."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results (default 20)."),
    }),
    execute: async ({ status, type, jobId, limit }) => {
      const { jobs, total } = await jobInstanceRepository.findByFilter({
        status,
        type,
        jobId,
        limit: limit ?? 20,
      });
      return {
        total,
        instances: jobs.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          priority: j.priority,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          scheduledAt: toIso(j.scheduledAt),
          startedAt: toIso(j.startedAt),
          completedAt: toIso(j.completedAt),
          error: j.error,
        })),
      };
    },
  }),

  cache_inspect: tool({
    description:
      "Inspect the in-memory LRU cache. With no arguments, lists cache keys " +
      "(optionally filtered by a substring search). Pass a full key to read a " +
      "single entry's value. Read-only.",
    inputSchema: z.object({
      key: z
        .string()
        .optional()
        .describe("Full cache key to read a single entry's value."),
      search: z
        .string()
        .optional()
        .describe("Substring to filter keys by (ignored if 'key' is given)."),
    }),
    execute: async ({ key, search }) => {
      if (key) {
        const entry = getEntry(key);
        if (!entry) return { found: false, key };
        return { found: true, ...entry };
      }
      return { stats: getCacheStats(), keys: listKeys(search) };
    },
  }),

  rate_limit_status: tool({
    description:
      "Inspect live rate-limit buckets. Optionally filter to one limiter " +
      "('global' or 'auth') and/or to currently blocked subjects only. " +
      "Returns per-subject counts, remaining quota, and reset times.",
    inputSchema: z.object({
      limiter: z
        .string()
        .optional()
        .describe("Limiter name, e.g. 'global' or 'auth'."),
      blockedOnly: z
        .boolean()
        .optional()
        .describe("Only return currently blocked buckets."),
    }),
    execute: async ({ limiter, blockedOnly }) => {
      return getRateLimitStatus({ limiter, blockedOnly });
    },
  }),
};

/** Human-readable catalogue of available tools, for the system prompt. */
export const platformToolCatalogue = [
  "- platform_overview: snapshot of platform health (jobs, cache, rate-limit, system)",
  "- list_jobs: list job templates (filter by type / enabled / limit)",
  "- list_job_instances: list job instances (filter by status / type / jobId / limit)",
  "- cache_inspect: inspect the in-memory cache (list keys, or read a single entry)",
  "- rate_limit_status: inspect rate-limit buckets (optionally only blocked subjects)",
].join("\n");
