import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { validateConfigWrite } from "#lib/config-write";
import { APPLICATION_CONFIG_INDEX } from "#modules/application/application-config.registry";
import { applicationConfigRepository } from "#modules/application/application-config.repository";
import {
  applyMask,
  mergeEnvFallback,
  parseMaskPattern,
} from "#modules/system/public";

type ApplicationConfigRow = Awaited<
  ReturnType<typeof applicationConfigRepository.findByAppAndGroup>
>[number];

function maskSecrets(rows: ApplicationConfigRow[]): ApplicationConfigRow[] {
  return rows.map((row) => {
    if (!row.isSecret || !row.value) return row;
    return { ...row, value: applyMask(row.value, parseMaskPattern(row.mask)) };
  });
}

/**
 * Fetches an app's group rows with env fallback already applied (DB
 * authoritative, env fallback). The shared `AI_AGENT_*` env vars act as a
 * deployment-time fallback for any app whose DB value is unset/empty.
 */
export async function getMergedAppConfigRows(appId: string, group: string) {
  const rows = await applicationConfigRepository.findByAppAndGroup(
    appId,
    group,
  );
  return mergeEnvFallback(rows);
}

export async function listAppConfigsByGroup(appId: string, group: string) {
  const rows = await applicationConfigRepository.findByAppAndGroup(
    appId,
    group,
  );
  return maskSecrets(mergeEnvFallback(rows));
}

export async function upsertAppConfig(
  appId: string,
  group: string,
  key: string,
  data: {
    value: string;
    type?: string;
    schema?: Prisma.InputJsonValue;
    label?: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
    mask?: string | null;
  },
) {
  // Allowlist + value guard. Metadata is registry-authoritative: client-supplied
  // type/isSecret/mask/label are ignored (see validateConfigWrite).
  const row = validateConfigWrite(
    APPLICATION_CONFIG_INDEX,
    group,
    key,
    data.value,
  );
  return applicationConfigRepository.upsert(appId, group, key, row);
}

export async function batchUpsertAppConfigs(
  items: Array<{
    appId: string;
    group: string;
    key: string;
    value: string;
    type?: string;
    schema?: Prisma.InputJsonValue;
    label?: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
    mask?: string | null;
  }>,
) {
  const rows = items.map((item) => {
    const row = validateConfigWrite(
      APPLICATION_CONFIG_INDEX,
      item.group,
      item.key,
      item.value,
    );
    return { appId: item.appId, group: item.group, key: item.key, ...row };
  });
  return applicationConfigRepository.batchUpsert(rows);
}

export async function deleteAppConfig(
  appId: string,
  group: string,
  key: string,
) {
  try {
    await applicationConfigRepository.delete(appId, group, key);
  } catch {
    throw new HTTPException(404, { message: "Config not found" });
  }
}
