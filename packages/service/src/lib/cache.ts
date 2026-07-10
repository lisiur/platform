import { LRUCache } from "lru-cache";

export class Cache {
  private ns: string;
  private lru: LRUCache<string, object>;

  private constructor(
    options:
      | { maxSize: number }
      | { lru: LRUCache<string, object>; ns?: string },
  ) {
    this.ns = "";
    if ("lru" in options) {
      this.lru = options.lru;
      if (options.ns) {
        this.ns = options.ns;
      }
    } else {
      this.lru = new LRUCache<string, object>({ maxSize: options.maxSize });
    }
  }

  private getNSKey(key: string) {
    if (this.ns) {
      return `${this.ns}:${key}`;
    } else {
      return key;
    }
  }

  static create(maxSize: number = 1000): Cache {
    return new Cache({ maxSize });
  }

  namespace(ns: string): Cache {
    ns = this.getNSKey(ns);
    return new Cache({ lru: this.lru, ns });
  }

  get<T>(key: string): T | undefined {
    key = this.getNSKey(key);
    return this.lru.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    key = this.getNSKey(key);
    this.lru.set(key, value as object);
  }

  delete(key: string): boolean {
    key = this.getNSKey(key);
    return this.lru.delete(key);
  }

  clear(prefix?: string): void {
    if (!prefix) {
      if (this.ns) {
        prefix = this.ns;
      } else {
        this.lru.clear();
        return;
      }
    } else {
      prefix = this.getNSKey(prefix);
    }
    for (const key of this.lru.keys()) {
      if (key.startsWith(prefix)) {
        this.lru.delete(key);
      }
    }
  }

  async getOrSet<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await fetchFn();
    this.set(key, value);
    return value;
  }
}
