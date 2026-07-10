import { globalCache } from "#states/cache";

export type CacheValueType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "unknown";

export interface CacheNamespaceInfo {
  name: string;
  keyCount: number;
}

export interface CacheStats {
  totalKeys: number;
  maxSize: number;
  namespaces: CacheNamespaceInfo[];
}

export interface CacheKeyInfo {
  fullKey: string;
  namespace: string;
  key: string;
  valueType: CacheValueType;
}

export interface CacheEntry extends CacheKeyInfo {
  value: unknown;
}

export function detectValueType(value: unknown): CacheValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "object") return "object";
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  return "unknown";
}

function deriveNamespace(fullKey: string): { namespace: string; key: string } {
  const idx = fullKey.lastIndexOf(":");
  if (idx === -1) return { namespace: "global", key: fullKey };
  return {
    namespace: fullKey.slice(0, idx),
    key: fullKey.slice(idx + 1),
  };
}

export function getCacheStats(): CacheStats {
  const keys = globalCache.keys();
  const namespaces = new Map<string, number>();

  for (const fullKey of keys) {
    const { namespace } = deriveNamespace(fullKey);
    namespaces.set(namespace, (namespaces.get(namespace) ?? 0) + 1);
  }

  return {
    totalKeys: keys.length,
    maxSize: globalCache.maxSize,
    namespaces: [...namespaces.entries()]
      .map(([name, keyCount]) => ({ name, keyCount }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function listKeys(search?: string): CacheKeyInfo[] {
  const keys = globalCache.keys();
  const result: CacheKeyInfo[] = [];

  for (const fullKey of keys) {
    if (search && !fullKey.toLowerCase().includes(search.toLowerCase())) {
      continue;
    }
    const { namespace, key } = deriveNamespace(fullKey);
    const value = globalCache.get<unknown>(fullKey);
    result.push({
      fullKey,
      namespace,
      key,
      valueType: detectValueType(value),
    });
  }

  return result.sort((a, b) => a.fullKey.localeCompare(b.fullKey));
}

export function getEntry(fullKey: string): CacheEntry | null {
  const value = globalCache.get<unknown>(fullKey);
  if (value === undefined) return null;
  const { namespace, key } = deriveNamespace(fullKey);
  return {
    fullKey,
    namespace,
    key,
    valueType: detectValueType(value),
    value,
  };
}

export function setEntry(fullKey: string, value: unknown): CacheEntry {
  globalCache.set(fullKey, value);
  const { namespace, key } = deriveNamespace(fullKey);
  return {
    fullKey,
    namespace,
    key,
    valueType: detectValueType(value),
    value,
  };
}

export function deleteEntry(fullKey: string): boolean {
  return globalCache.delete(fullKey);
}

export function clearNamespace(namespace: string): number {
  const keys = globalCache.keys();
  let count = 0;
  for (const key of keys) {
    if (key.startsWith(`${namespace}:`) || key === namespace) {
      globalCache.delete(key);
      count++;
    }
  }
  return count;
}

export function clearAll(): number {
  const count = globalCache.keys().length;
  globalCache.clear();
  return count;
}
