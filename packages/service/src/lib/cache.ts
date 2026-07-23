import { LRUCache } from "lru-cache";

export class Cache {
  private ns: string;
  private lru: LRUCache<string, object>;

  private constructor(
    options:
      | { maxSize: number; ttlAutopurge?: boolean }
      | { lru: LRUCache<string, object>; ns?: string },
  ) {
    this.ns = "";
    if ("lru" in options) {
      this.lru = options.lru;
      if (options.ns) {
        this.ns = options.ns;
      }
    } else {
      this.lru = new LRUCache<string, object>({
        max: options.maxSize,
        ttlAutopurge: options.ttlAutopurge ?? false,
      });
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
    return new Cache({ maxSize, ttlAutopurge: true });
  }

  namespace(ns: string): Cache {
    ns = this.getNSKey(ns);
    return new Cache({ lru: this.lru, ns });
  }

  get<T>(key: string): T | undefined {
    key = this.getNSKey(key);
    return this.lru.get(key) as T | undefined;
  }

  set(key: string, value: unknown, options?: { ttl?: number }): void {
    key = this.getNSKey(key);
    this.lru.set(key, value as object, options);
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

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: { ttl?: number },
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await fetchFn();
    this.set(key, value, options);
    return value;
  }

  keys(): string[] {
    const all = [...this.lru.keys()];
    if (!this.ns) return all;
    const prefix = `${this.ns}:`;
    return all
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  get size(): number {
    return this.keys().length;
  }

  get maxSize(): number {
    return this.lru.max ?? 0;
  }

  getFullKey(key: string): string {
    return this.getNSKey(key);
  }

  has(key: string): boolean {
    return this.lru.has(this.getNSKey(key));
  }
}
