import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import type { ConfigIndex, ConfigRegistryEntry } from "#lib/config-registry";

/**
 * The registry-authoritative row written to the DB. Client-supplied metadata
 * (type/isSecret/mask/label/...) is deliberately dropped so a caller cannot
 * flip `isSecret:false` on a secret to de-mask it via the listing endpoint, nor
 * weaken a `mask`, nor corrupt display state. Only `value` comes from the
 * caller — and only after passing `valueSchema`.
 */
export interface RegistryAuthoritativeRow {
  value: string;
  type: string;
  schema?: Prisma.InputJsonValue;
  label: string;
  description?: string;
  isSecret: boolean;
  sortOrder: number;
  mask?: string | null;
}

/**
 * Validates an incoming write against a registry index. Returns the row to
 * persist (registry metadata + validated value), or throws `400` when the key
 * is unknown or the value fails its `valueSchema`.
 *
 * Lives apart from `config-registry.ts` (which stays Hono-free so the seed
 * script can import it without pulling in HTTP machinery).
 */
export function validateConfigWrite<Entry extends ConfigRegistryEntry>(
  index: ConfigIndex<Entry>,
  group: string,
  key: string,
  value: string,
): RegistryAuthoritativeRow {
  const entry = index.get(group, key);
  if (!entry) {
    throw new HTTPException(400, {
      message: `Unknown config key: ${group}.${key}`,
    });
  }
  const result = entry.valueSchema.safeParse(value);
  if (!result.success) {
    throw new HTTPException(400, {
      message: `Invalid value for ${group}.${key}: ${
        result.error.issues[0]?.message ?? "validation failed"
      }`,
    });
  }
  return {
    value: result.data as string,
    type: entry.type,
    schema: entry.schema,
    label: entry.label,
    description: entry.description,
    isSecret: entry.isSecret,
    mask: entry.mask,
    sortOrder: entry.sortOrder,
  };
}
