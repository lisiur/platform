type Bucket = { count: number; resetAt: number };

export type HitResult = { count: number; resetAt: number };

export class RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(sweepIntervalMs = 60_000) {
    if (sweepIntervalMs > 0) {
      this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
      this.sweeper.unref?.();
    }
  }

  hit(key: string, windowMs: number): HitResult {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }

    bucket.count += 1;
    return { count: bucket.count, resetAt: bucket.resetAt };
  }

  reset(key: string): boolean {
    return this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }

  snapshot(): (HitResult & { key: string })[] {
    const now = Date.now();
    return [...this.buckets.entries()]
      .filter(([, bucket]) => bucket.resetAt > now)
      .map(([key, bucket]) => ({
        key,
        count: bucket.count,
        resetAt: bucket.resetAt,
      }));
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  close(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }
}
