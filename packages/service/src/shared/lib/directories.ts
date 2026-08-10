import { join } from "node:path";

function dataDir(): string {
  return process.env.DATA_DIR ?? /*turbopackIgnore: true*/ process.cwd();
}

export function uploadsDir(): string {
  return join(dataDir(), "uploads");
}

export function agentAttachmentsDir(): string {
	return join(uploadsDir(), "agent-attachments");
}
