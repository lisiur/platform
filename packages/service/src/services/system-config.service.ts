import { HTTPException } from "hono/http-exception";
import { systemConfigRepository } from "#repositories/system-config.repository";

export async function upsertConfig(
  group: string,
  key: string,
  data: {
    value: string;
    type?: string;
    label: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
  },
) {
  return systemConfigRepository.upsert(group, key, data);
}

export async function batchUpsertConfigs(
  items: Array<{
    group: string;
    key: string;
    value: string;
    type?: string;
    label: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
  }>,
) {
  return systemConfigRepository.batchUpsert(items);
}

export async function deleteConfig(group: string, key: string) {
  try {
    await systemConfigRepository.delete(group, key);
  } catch {
    throw new HTTPException(404, { message: "Config not found" });
  }
}

export async function listAllConfigs(group?: string) {
  if (group) {
    return systemConfigRepository.findByGroup(group);
  }
  return systemConfigRepository.findAll();
}

export async function listConfigsByGroup(group: string) {
  return systemConfigRepository.findByGroup(group);
}
