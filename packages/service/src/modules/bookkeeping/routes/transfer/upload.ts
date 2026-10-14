import { HTTPException } from "hono/http-exception";
import { MAX_IMPORT_BODY_SIZE } from "#lib/constants";
import type { ImportTarget } from "../../transfer/import.service";

/**
 * The two import endpoints take the same multipart body — one file part
 * plus the target — so the reading lives here rather than in either route.
 */

/** The one file part of the multipart body, in bytes plus its File so the
 *  caller can report the name back in an error. */
export async function readUploadedFile(value: unknown): Promise<{
  bytes: Buffer;
  file: File;
}> {
  if (!(value instanceof File) || value.size === 0) {
    throw new HTTPException(400, { message: "没有选择文件" });
  }
  if (value.size > MAX_IMPORT_BODY_SIZE) {
    throw new HTTPException(413, {
      message: `文件超过 ${MAX_IMPORT_BODY_SIZE / 1024 / 1024}MB 上限`,
    });
  }
  return {
    bytes: Buffer.from(await value.arrayBuffer()),
    file: value,
  };
}

/**
 * Where the import lands. Absent (or "new") creates a ledger; anything
 * else is a ledger id to merge into, and the guard that decides whether
 * the caller may is the merge plan's own access check.
 */
export function parseTarget(
  raw: string | undefined,
  ledgerName: string | undefined,
): ImportTarget {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "new") {
    return {
      mode: "new",
      ...(ledgerName?.trim() ? { ledgerName: ledgerName.trim() } : {}),
    };
  }
  return { mode: "merge", ledgerId: trimmed };
}
