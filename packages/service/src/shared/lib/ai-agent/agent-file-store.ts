import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UPLOADS_ROOT =
  process.env.UPLOAD_ROOT_DIR ?? join(process.cwd(), "uploads");
const FILE_DIR =
  process.env.AGENT_FILE_DIR ?? join(UPLOADS_ROOT, "agent-attachments");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentFileMeta {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
}

function sessionDir(sessionId: string): string {
  return join(FILE_DIR, sessionId);
}

function filePath(sessionId: string, fileId: string): string {
  return join(sessionDir(sessionId), fileId);
}

function metaPath(sessionId: string, fileId: string): string {
  return join(sessionDir(sessionId), `${fileId}.meta.json`);
}

export async function saveAgentFile(
  sessionId: string,
  file: File,
): Promise<AgentFileMeta> {
  if (!UUID_RE.test(sessionId)) {
    throw new Error(`Invalid sessionId`);
  }
  const fileId = randomUUID();
  await mkdir(sessionDir(sessionId), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath(sessionId, fileId), buffer);

  const meta: AgentFileMeta = {
    fileId,
    filename: file.name || `file-${fileId}`,
    mimeType: file.type || "application/octet-stream",
    size: buffer.length,
  };
  await writeFile(metaPath(sessionId, fileId), JSON.stringify(meta));

  return meta;
}

export async function resolveAgentFile(
  sessionId: string,
  fileId: string,
): Promise<File | null> {
  if (!UUID_RE.test(sessionId) || !UUID_RE.test(fileId)) return null;

  const metaRaw = await readFile(metaPath(sessionId, fileId), "utf-8").catch(
    () => null,
  );
  if (!metaRaw) return null;

  let meta: AgentFileMeta;
  try {
    meta = JSON.parse(metaRaw) as AgentFileMeta;
  } catch {
    return null;
  }

  const buffer = await readFile(filePath(sessionId, fileId)).catch(() => null);
  if (!buffer) return null;

  return new File([buffer], meta.filename, { type: meta.mimeType });
}

export async function cleanupSessionFiles(sessionId: string): Promise<void> {
  if (!UUID_RE.test(sessionId)) return;
  await rm(sessionDir(sessionId), { recursive: true, force: true });
}
