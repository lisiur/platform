import { spawn } from "node:child_process";

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SpawnOpts {
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

// Async spawn that keeps the caller's event loop responsive. Unlike spawnSync
// (which blocks the daemon's HTTP server for the whole duration of an
// `npm install` / `prisma migrate`), this lets /status and /cancel stay
// serviced while the child runs — so the status bridge can observe every
// intermediate step instead of going dark.
//
// Resolves with the collected result; rejects ONLY on a spawn-level failure
// (e.g. ENOENT when the binary is missing) so callers can distinguish a missing
// binary from a non-zero exit.
export function spawnAsync(
  cmd: string,
  args: string[],
  opts: SpawnOpts,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGKILL");
          } catch {
            // already exited
          }
        }, opts.timeoutMs)
      : null;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}
