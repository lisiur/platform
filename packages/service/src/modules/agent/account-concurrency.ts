interface Slot {
  active: number;
  queue: Array<() => void>;
}

/**
 * In-process, per-account concurrency gate. Acceptable for a single-instance
 * deployment; a multi-instance setup would need a shared store (e.g. Redis).
 */
export class AccountConcurrencyTracker {
  private slots = new Map<string, Slot>();

  private slot(accountId: string): Slot {
    let s = this.slots.get(accountId);
    if (!s) {
      s = { active: 0, queue: [] };
      this.slots.set(accountId, s);
    }
    return s;
  }

  utilization(accountId: string, limit: number): number {
    const s = this.slots.get(accountId);
    if (!s || limit <= 0) return 0;
    return s.active / limit;
  }

  async acquire(accountId: string, limit: number): Promise<void> {
    const s = this.slot(accountId);
    if (s.active < limit) {
      s.active++;
      return;
    }
    await new Promise<void>((resolve) => {
      s.queue.push(resolve);
    });
  }

  release(accountId: string): void {
    const s = this.slots.get(accountId);
    if (!s) return;
    const next = s.queue.shift();
    if (next) {
      next();
      return;
    }
    s.active = Math.max(0, s.active - 1);
  }

  async run<T>(
    accountId: string,
    limit: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.acquire(accountId, limit);
    try {
      return await fn();
    } finally {
      this.release(accountId);
    }
  }
}

export const accountConcurrencyTracker = new AccountConcurrencyTracker();
