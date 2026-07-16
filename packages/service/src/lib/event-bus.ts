import type { ServerEvent } from "@repo/shared";

export interface Subscriber {
  targets: string[];
  onEvent: (event: ServerEvent) => void;
  onClose?: () => void;
}

function matches(a: string, b: string): boolean {
  const sa = a.split(":");
  const sb = b.split(":");
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== "*" && sb[i] !== "*" && sa[i] !== sb[i]) return false;
  }
  return true;
}

export class EventBus {
  private subscribers = new Set<Subscriber>();

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  publish(event: ServerEvent): void {
    for (const sub of this.subscribers) {
      if (sub.targets.some((t) => matches(t, event.target))) {
        sub.onEvent(event);
      }
    }
  }

  close(target: string): void {
    for (const sub of [...this.subscribers]) {
      if (sub.targets.some((t) => matches(t, target))) {
        this.subscribers.delete(sub);
        sub.onClose?.();
      }
    }
  }

  getStats() {
    return { subscribers: this.subscribers.size };
  }
}
