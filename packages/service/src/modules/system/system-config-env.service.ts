import { systemConfigRepository } from "#modules/system/system-config.repository";

type ConfigRow = Awaited<
  ReturnType<typeof systemConfigRepository.findByGroup>
>[number];

/**
 * Derives the env-var name for a (group, key) pair using a single mechanical
 * convention: `${GROUP}_${KEY}` where GROUP is uppercased with dashes →
 * underscores, and KEY has dots → underscores, camelCase → snake_case, then
 * uppercased. Examples: ("ai-agent","baseURL") → "AI_AGENT_BASE_URL",
 * ("webauthn","rp.id") → "WEBAUTHN_RP_ID", ("rate-limit","global.windowMs")
 * → "RATE_LIMIT_GLOBAL_WINDOW_MS".
 *
 * This matches every existing hand-written env-var name in the codebase, so
 * the fallback is fully generic with no per-group map table required.
 */
export function envVarFor(group: string, key: string): string {
  const g = group.toUpperCase().replace(/-/g, "_");
  const k = key
    .replace(/\./g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
  return `${g}_${k}`;
}

/** Reads the env fallback for a config key; undefined when unset/blank. */
export function envValueFor(group: string, key: string): string | undefined {
  const raw = process.env[envVarFor(group, key)];
  if (raw !== undefined && raw.trim().length > 0) return raw.trim();
  return undefined;
}

/** Returns the first non-empty (trimmed) value, or undefined. */
export function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  for (const v of values) {
    if (v !== undefined && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function isEmpty(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim().length === 0;
}

/**
 * Fills empty (or whitespace-only) DB rows with their env-derived fallback
 * value. DB stays authoritative: a non-empty DB value is never overwritten.
 * Group-agnostic — each row carries its own `group`. Used by both the listing
 * endpoints (so the Settings UI shows the effective value as a placeholder)
 * and runtime loaders (after which they apply typed coercion).
 */
export function mergeEnvFallback<
  T extends { group: string; key: string; value: string },
>(rows: T[]): T[] {
  return rows.map((row) => {
    if (!isEmpty(row.value)) return row;
    const envFb = envValueFor(row.group, row.key);
    return envFb !== undefined ? { ...row, value: envFb } : row;
  });
}

/**
 * Fetches a group's rows with env fallback already applied (DB authoritative,
 * env fallback). Single source of truth for runtime config loaders.
 */
export async function getMergedConfigRows(group: string): Promise<ConfigRow[]> {
  const rows = await systemConfigRepository.findByGroup(group);
  return mergeEnvFallback(rows);
}
