import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { systemConfigRepository } from "#repositories/system-config.repository";
import { mergeEnvFallback } from "./system-config-env.service";

type SystemConfigRow = Awaited<
  ReturnType<typeof systemConfigRepository.findByGroup>
>[number];

export interface ParsedMask {
  start?: number;
  end?: number;
  mask?: { kind: "fixed"; n: number } | { kind: "all" };
}

const START_RE = /start\{(\d+)\}/;
const END_RE = /end\{(\d+)\}/;
const MASK_FIXED_RE = /\.\{(\d+)\}/;
const MASK_ALL_RE = /\.\{\*\}/;

/**
 * Lenient mask-pattern parser. Recognized tokens (first match wins, unknown
 * text ignored):
 *   start{N}  keep first N chars
 *   end{N}    keep last N chars
 *   .{N}      exactly N mask chars
 *   .{*}      one mask char per hidden char
 * Returns null for null/empty/whitespace input. A non-null input with no
 * recognized tokens yields an empty object (applyMask then masks the whole
 * value, matching the no-config default).
 */
export function parseMaskPattern(
  raw: string | null | undefined,
): ParsedMask | null {
  if (raw === null || raw === undefined || raw.trim().length === 0) return null;
  const parsed: ParsedMask = {};
  const startMatch = START_RE.exec(raw);
  if (startMatch) parsed.start = Number(startMatch[1]);
  const endMatch = END_RE.exec(raw);
  if (endMatch) parsed.end = Number(endMatch[1]);
  if (MASK_ALL_RE.exec(raw)) {
    parsed.mask = { kind: "all" };
  } else {
    const fixedMatch = MASK_FIXED_RE.exec(raw);
    if (fixedMatch) parsed.mask = { kind: "fixed", n: Number(fixedMatch[1]) };
  }
  return parsed;
}

function dots(n: number): string {
  return n > 0 ? ".".repeat(n) : "";
}

/**
 * Applies a parsed mask. A null pattern (or a secret with no mask config)
 * yields a full length-preserving mask. Overlap between start and end is
 * resolved in favor of start.
 */
export function applyMask(value: string, pattern: ParsedMask | null): string {
  if (!pattern) return dots(value.length);
  const len = value.length;
  let startN = pattern.start ?? 0;
  if (startN > len) startN = len;
  let endN = pattern.end ?? 0;
  const remaining = len - startN;
  if (endN > remaining) endN = remaining;
  if (endN < 0) endN = 0;
  const prefix = startN > 0 ? value.slice(0, startN) : "";
  const suffix = endN > 0 ? value.slice(len - endN) : "";
  const hidden = len - prefix.length - suffix.length;
  let middle: string;
  if (!pattern.mask) {
    middle = dots(hidden);
  } else if (pattern.mask.kind === "fixed") {
    middle = dots(pattern.mask.n);
  } else {
    middle = dots(hidden);
  }
  return prefix + middle + suffix;
}

function maskSecrets(rows: SystemConfigRow[]): SystemConfigRow[] {
  return rows.map((row) => {
    if (!row.isSecret || !row.value) return row;
    return { ...row, value: applyMask(row.value, parseMaskPattern(row.mask)) };
  });
}

export async function upsertConfig(
  group: string,
  key: string,
  data: {
    value: string;
    type?: string;
    schema?: Prisma.InputJsonValue;
    label: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
    mask?: string | null;
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
    schema?: Prisma.InputJsonValue;
    label: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
    mask?: string | null;
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
  const rows = group
    ? await systemConfigRepository.findByGroup(group)
    : await systemConfigRepository.findAll();
  return maskSecrets(mergeEnvFallback(rows));
}

export async function listConfigsByGroup(group: string) {
  const rows = await systemConfigRepository.findByGroup(group);
  return maskSecrets(mergeEnvFallback(rows));
}
