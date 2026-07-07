import type { ServerEvent } from "@repo/shared";

export interface Subscriber {
  userId: string;
  token: string;
  appFilter?: string;
  onEvent: (event: ServerEvent) => void;
  disconnect: () => void;
}

export class EventBus {
  private byUser = new Map<string, Set<Subscriber>>();
  private byToken = new Map<string, Set<Subscriber>>();

  subscribe(subscriber: Subscriber): () => void {
    this.addToIndex(this.byUser, subscriber.userId, subscriber);
    this.addToIndex(this.byToken, subscriber.token, subscriber);
    return () => this.remove(subscriber);
  }

  emit(userId: string, event: ServerEvent): void {
    const subs = this.byUser.get(userId);
    if (!subs) return;
    for (const sub of subs) {
      if (sub.appFilter && event.appId && sub.appFilter !== event.appId)
        continue;
      sub.onEvent(event);
    }
  }

  broadcast(event: ServerEvent): void {
    for (const subs of this.byUser.values()) {
      for (const sub of subs) {
        if (sub.appFilter && event.appId && sub.appFilter !== event.appId)
          continue;
        sub.onEvent(event);
      }
    }
  }

  disconnectByToken(token: string): void {
    const subs = this.byToken.get(token);
    if (!subs) return;
    for (const sub of [...subs]) {
      sub.disconnect();
      this.remove(sub);
    }
  }

  getStats() {
    let subscribers = 0;
    for (const set of this.byUser.values()) subscribers += set.size;
    return { users: this.byUser.size, tokens: this.byToken.size, subscribers };
  }

  private addToIndex(
    index: Map<string, Set<Subscriber>>,
    key: string,
    subscriber: Subscriber,
  ) {
    let set = index.get(key);
    if (!set) {
      set = new Set();
      index.set(key, set);
    }
    set.add(subscriber);
  }

  private remove(subscriber: Subscriber) {
    this.byUser.get(subscriber.userId)?.delete(subscriber);
    this.byToken.get(subscriber.token)?.delete(subscriber);
  }
}
