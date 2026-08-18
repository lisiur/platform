import type { ZodType } from "zod";
import type { Prisma } from "#generated/prisma/client";

export type ConfigType = "string" | "number" | "boolean" | "json" | "select";

/**
 * A registry entry is the single source of truth for one config key.
 *
 *   - Metadata (group/key/type/label/isSecret/mask/...) is
 *     registry-authoritative: the API ignores client-supplied metadata so a
 *     caller cannot flip `isSecret:false` on a secret to de-mask it via the
 *     listing endpoint, nor weaken a `mask`, nor corrupt display state.
 *   - `defaultValue` is what `seed()` writes (when `seed !== false`).
 *   - `valueSchema` validates the incoming string `value` on every write; its
 *     parsed output is stored verbatim (every schema below yields a string).
 *   - `seed: false` marks a key that is valid for writes but created on demand
 *     (not seeded).
 *
 * Both the seed script and the runtime API import the SAME registry, so the set
 * of valid keys cannot drift between "what seed writes" and "what the API
 * accepts": adding a key requires one edit here, and seed / API / loaders all
 * agree.
 */
export interface ConfigRegistryEntry {
  group: string;
  key: string;
  type: ConfigType;
  label: string;
  description?: string;
  isSecret: boolean;
  sortOrder: number;
  mask?: string | null;
  schema?: Prisma.InputJsonValue;
  /** Value seed writes. Ignored when `seed === false`. */
  defaultValue: string;
  /** Validates the incoming string `value` on writes; output stored verbatim. */
  valueSchema: ZodType;
  /** When false, the key is valid for writes but not seeded. Default true. */
  seed?: boolean;
}

export interface ConfigIndex<Entry extends ConfigRegistryEntry> {
  get(group: string, key: string): Entry | undefined;
  has(group: string, key: string): boolean;
  /** Entries seed should write (those without `seed: false`). */
  seedable(): Entry[];
  all(): Entry[];
}

export function buildConfigIndex<Entry extends ConfigRegistryEntry>(
  entries: Entry[],
): ConfigIndex<Entry> {
  const map = new Map(entries.map((e) => [`${e.group}::${e.key}`, e]));
  return {
    get: (group, key) => map.get(`${group}::${key}`),
    has: (group, key) => map.has(`${group}::${key}`),
    seedable: () => entries.filter((e) => e.seed !== false),
    all: () => entries,
  };
}
