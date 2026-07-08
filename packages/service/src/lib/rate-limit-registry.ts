import type { RateLimitStore } from "#lib/rate-limit-store";

export type RateLimitPolicy = {
  bypass: boolean;
  max: number;
  windowMs: number;
};

export type OverrideRecord = {
  subject: string;
  max: number | null;
  windowMs: number | null;
  bypass: boolean;
  startAt: Date | null;
  endAt: Date | null;
};

type Override = {
  max: number | null;
  windowMs: number | null;
  bypass: boolean;
  startAt: number | null;
  endAt: number | null;
};

type LimiterEntry = {
  name: string;
  max: number;
  windowMs: number;
  enabled: boolean;
  store: RateLimitStore;
};

export type BucketStatus = {
  limiter: string;
  subject: string;
  count: number;
  max: number | null;
  remaining: number | null;
  bypass: boolean;
  blocked: boolean;
  resetAt: number;
};

export type LimiterStatus = {
  name: string;
  max: number;
  windowMs: number;
  buckets: BucketStatus[];
};

function isOverrideActive(ov: Override): boolean {
  const now = Date.now();
  if (ov.startAt && now < ov.startAt) return false;
  if (ov.endAt && now >= ov.endAt) return false;
  return true;
}

function toOverride(record: OverrideRecord): Override {
  return {
    max: record.max,
    windowMs: record.windowMs,
    bypass: record.bypass,
    startAt: record.startAt ? record.startAt.getTime() : null,
    endAt: record.endAt ? record.endAt.getTime() : null,
  };
}

class RateLimitRegistry {
  private limiters = new Map<string, LimiterEntry>();
  private overrides = new Map<string, Override>();

  registerLimiter(entry: LimiterEntry): void {
    this.limiters.set(entry.name, entry);
  }

  updateDefaults(
    name: string,
    patch: Partial<Pick<LimiterEntry, "max" | "windowMs" | "enabled">>,
  ): boolean {
    const entry = this.limiters.get(name);
    if (!entry) return false;
    if (patch.max !== undefined) entry.max = patch.max;
    if (patch.windowMs !== undefined) entry.windowMs = patch.windowMs;
    if (patch.enabled !== undefined) entry.enabled = patch.enabled;
    return true;
  }

  getLimiter(name: string): LimiterEntry | undefined {
    return this.limiters.get(name);
  }

  listLimiters(): string[] {
    return [...this.limiters.keys()];
  }

  resolvePolicy(name: string, subject: string): RateLimitPolicy {
    const entry = this.limiters.get(name);
    if (!entry) {
      return {
        bypass: true,
        max: Infinity,
        windowMs: 60_000,
      };
    }

    const ov = this.overrides.get(subject);
    if (ov && isOverrideActive(ov)) {
      if (ov.bypass) {
        return { bypass: true, max: Infinity, windowMs: entry.windowMs };
      }
      return {
        bypass: false,
        max: ov.max ?? entry.max,
        windowMs: ov.windowMs ?? entry.windowMs,
      };
    }

    return { bypass: false, max: entry.max, windowMs: entry.windowMs };
  }

  loadOverrides(records: OverrideRecord[]): void {
    this.overrides.clear();
    for (const record of records) {
      this.overrides.set(record.subject, toOverride(record));
    }
  }

  setOverride(record: OverrideRecord): void {
    this.overrides.set(record.subject, toOverride(record));
  }

  removeOverride(subject: string): void {
    this.overrides.delete(subject);
  }

  isSubjectActive(subject: string): boolean {
    const ov = this.overrides.get(subject);
    return ov ? isOverrideActive(ov) : false;
  }

  snapshot(name?: string): LimiterStatus[] {
    const entries = name
      ? (() => {
          const entry = this.limiters.get(name);
          return entry ? [entry] : [];
        })()
      : [...this.limiters.values()];

    return entries.map((entry) => ({
      name: entry.name,
      max: entry.max,
      windowMs: entry.windowMs,
      buckets: entry.store
        .snapshot()
        .map((bucket) => {
          const policy = this.resolvePolicy(entry.name, bucket.key);
          const max = policy.bypass ? Infinity : policy.max;
          return {
            limiter: entry.name,
            subject: bucket.key,
            count: bucket.count,
            max: policy.bypass ? null : max,
            remaining: policy.bypass ? null : Math.max(0, max - bucket.count),
            bypass: policy.bypass,
            blocked: bucket.count > max,
            resetAt: bucket.resetAt,
          };
        })
        .sort((a, b) => b.count - a.count),
    }));
  }

  releaseKey(name: string, subject: string): boolean {
    const entry = this.limiters.get(name);
    if (!entry) return false;
    return entry.store.reset(subject);
  }

  releaseSubject(subject: string): string[] {
    const released: string[] = [];
    for (const entry of this.limiters.values()) {
      if (entry.store.reset(subject)) {
        released.push(entry.name);
      }
    }
    return released;
  }
}

export const rateLimitRegistry = new RateLimitRegistry();
