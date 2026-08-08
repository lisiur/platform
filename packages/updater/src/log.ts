import { createWriteStream, type WriteStream } from "node:fs";
import { LOG_FILE } from "./config";

// Lazily-opened append stream so a bad log path can't crash the daemon at boot.
let stream: WriteStream | null = null;

function getStream(): WriteStream | null {
  if (stream) return stream;
  try {
    stream = createWriteStream(LOG_FILE, { flags: "a" });
    stream.on("error", () => {
      stream = null;
    });
    return stream;
  } catch {
    return null;
  }
}

export function log(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  const s = getStream();
  if (s && !s.destroyed && !s.writableEnded) {
    s.write(`${line}\n`);
  }
}

export function closeLog(): Promise<void> {
  return new Promise((resolve) => {
    const s = stream;
    stream = null;
    if (!s || s.destroyed) {
      resolve();
      return;
    }
    s.end(() => resolve());
  });
}
