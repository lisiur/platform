import type { OverrideRecord } from "#lib/rate-limit-registry";
import { rateLimitRegistry } from "#lib/rate-limit-registry";
import { rateLimitRepository } from "#repositories/rate-limit.repository";
import { systemConfigRepository } from "#repositories/system-config.repository";
import { eventBus } from "#states/event-bus";

export type RateLimitStatusQuery = {
  limiter?: string;
  blockedOnly?: boolean;
};

export type OverrideInput = {
  type: string;
  max?: number | null;
  windowMs?: number | null;
  bypass?: boolean;
  note?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
};

type OverrideRow = Awaited<
  ReturnType<typeof rateLimitRepository.findAll>
>[number];

function serializeOverride(row: OverrideRow) {
  return {
    id: row.id,
    subject: row.subject,
    type: row.type as "ip" | "user",
    max: row.max,
    windowMs: row.windowMs,
    bypass: row.bypass,
    note: row.note,
    startAt: row.startAt ? row.startAt.toISOString() : null,
    endAt: row.endAt ? row.endAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOverrideRecord(
  row: OverrideRow,
): { subject: string } & OverrideRecord {
  return {
    subject: row.subject,
    max: row.max,
    windowMs: row.windowMs,
    bypass: row.bypass,
    startAt: row.startAt,
    endAt: row.endAt,
  };
}

export async function initRateLimitOverrides() {
  const rows = await rateLimitRepository.findAll();
  rateLimitRegistry.loadOverrides(rows.map(toOverrideRecord));
}

const RATE_LIMIT_LIMITERS = ["global", "auth"] as const;

type RateLimitDefaults = {
  enabled: boolean;
  limiters: Record<string, { max: number; windowMs: number }>;
};

async function loadRateLimitDefaults(): Promise<RateLimitDefaults> {
  const rows = await systemConfigRepository.findByGroup("rate-limit");
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const enabled = (map.get("enabled") ?? "true") === "true";
  const limiters: Record<string, { max: number; windowMs: number }> = {};

  for (const name of RATE_LIMIT_LIMITERS) {
    const max = Number(map.get(`${name}.max`));
    const windowMs = Number(map.get(`${name}.windowMs`));
    if (
      Number.isFinite(max) &&
      max > 0 &&
      Number.isFinite(windowMs) &&
      windowMs > 0
    ) {
      limiters[name] = { max, windowMs };
    }
  }

  return { enabled, limiters };
}

function applyRateLimitDefaults({ enabled, limiters }: RateLimitDefaults) {
  for (const name of RATE_LIMIT_LIMITERS) {
    const cfg = limiters[name];
    if (!cfg) continue;
    rateLimitRegistry.updateDefaults(name, { ...cfg, enabled });
  }
}

export async function initRateLimitDefaults() {
  applyRateLimitDefaults(await loadRateLimitDefaults());
}

export async function reloadRateLimitDefaults() {
  applyRateLimitDefaults(await loadRateLimitDefaults());
}

export async function listOverrides() {
  const rows = await rateLimitRepository.findAll();
  return rows.map(serializeOverride);
}

export async function upsertOverride(subject: string, data: OverrideInput) {
  const type = data.type ?? subject.split(":")[0];
  const row = await rateLimitRepository.upsert(subject, {
    type,
    max: data.max ?? null,
    windowMs: data.windowMs ?? null,
    bypass: data.bypass ?? false,
    note: data.note ?? null,
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
  });

  rateLimitRegistry.setOverride(toOverrideRecord(row));
  eventBus.broadcast({ type: "rate_limit.updated", appId: "admin" });
  return serializeOverride(row);
}

export async function deleteOverride(subject: string) {
  try {
    await rateLimitRepository.delete(subject);
  } catch {
    return false;
  }
  rateLimitRegistry.removeOverride(subject);
  eventBus.broadcast({ type: "rate_limit.updated", appId: "admin" });
  return true;
}

export function getRateLimitStatus(query: RateLimitStatusQuery) {
  const snapshot = rateLimitRegistry.snapshot(query.limiter);
  let buckets = snapshot.flatMap((l) => l.buckets);
  if (query.blockedOnly) {
    buckets = buckets.filter((b) => b.blocked);
  }
  return {
    limiters: snapshot.map((l) => ({
      name: l.name,
      max: l.max,
      windowMs: l.windowMs,
    })),
    blockedCount: buckets.filter((b) => b.blocked).length,
    buckets: buckets.map((b) => ({
      ...b,
      resetAt: new Date(b.resetAt).toISOString(),
    })),
  };
}

export function releaseRateLimit(opts: { limiter?: string; subject: string }) {
  if (opts.limiter) {
    const ok = rateLimitRegistry.releaseKey(opts.limiter, opts.subject);
    if (ok) {
      eventBus.broadcast({ type: "rate_limit.updated", appId: "admin" });
    }
    return { released: ok ? [opts.limiter] : [], subject: opts.subject };
  }
  const released = rateLimitRegistry.releaseSubject(opts.subject);
  if (released.length > 0) {
    eventBus.broadcast({ type: "rate_limit.updated", appId: "admin" });
  }
  return { released, subject: opts.subject };
}
