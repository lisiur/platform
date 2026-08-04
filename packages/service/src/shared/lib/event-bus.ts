import type { ServerEvent } from "@repo/shared";

export interface Subscriber {
  targets: string[];
  onEvent: (event: ServerEvent) => void;
  onClose?: () => void;
}

function matches(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== "*" && b[i] !== "*" && a[i] !== b[i]) return false;
  }
  return true;
}

interface IndexedSubscriber {
  onEvent: (event: ServerEvent) => void;
  onClose?: () => void;
  parsedTargets: string[][];
  bucketKeys: Set<string>;
}

function bucketKeyOf(segments: string[]): string {
  return segments[1] ?? "*";
}

export class EventBus {
  private subscribers = new Set<IndexedSubscriber>();
  private buckets = new Map<string, Set<IndexedSubscriber>>();

  subscribe(subscriber: Subscriber): () => void {
    const parsedTargets = subscriber.targets.map((t) => t.split(":"));
    const bucketKeys = new Set(parsedTargets.map(bucketKeyOf));

    const entry: IndexedSubscriber = {
      onEvent: subscriber.onEvent,
      onClose: subscriber.onClose,
      parsedTargets,
      bucketKeys,
    };

    this.subscribers.add(entry);
    for (const key of bucketKeys) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Set();
        this.buckets.set(key, bucket);
      }
      bucket.add(entry);
    }

    return () => this.removeEntry(entry);
  }

  private removeEntry(entry: IndexedSubscriber): void {
    if (!this.subscribers.delete(entry)) return;
    for (const key of entry.bucketKeys) {
      const bucket = this.buckets.get(key);
      if (bucket) {
        bucket.delete(entry);
        if (bucket.size === 0) this.buckets.delete(key);
      }
    }
  }

  private candidates(targetSegs: string[]): Set<IndexedSubscriber> {
    const appSeg = targetSegs[1];
    const result = new Set<IndexedSubscriber>();

    if (appSeg && appSeg !== "*") {
      const bucket = this.buckets.get(appSeg);
      if (bucket) for (const s of bucket) result.add(s);
      const wildcard = this.buckets.get("*");
      if (wildcard) for (const s of wildcard) result.add(s);
    } else {
      for (const bucket of this.buckets.values())
        for (const s of bucket) result.add(s);
    }
    return result;
  }

  publish(event: ServerEvent): void {
    const segs = event.target.split(":");
    for (const sub of this.candidates(segs)) {
      if (sub.parsedTargets.some((t) => matches(t, segs))) {
        sub.onEvent(event);
      }
    }
  }

  close(target: string): void {
    const segs = target.split(":");
    for (const sub of [...this.candidates(segs)]) {
      if (sub.parsedTargets.some((t) => matches(t, segs))) {
        this.removeEntry(sub);
        sub.onClose?.();
      }
    }
  }

  getStats() {
    return { subscribers: this.subscribers.size };
  }
}
