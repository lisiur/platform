import http from "node:http";
import { join } from "node:path";
import type { ApplyUpdateMode, UpdatePhase, UpdateStatus } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { eventBus } from "#states";

// The updater daemon is a peer process under the same PM2 god (its own
// ecosystem file). The service talks to it over a Unix socket; the daemon owns
// the deploy pipeline, the run lock, and the authoritative update status. This
// module is the service's entire interface to it.

function socketPath(): string | null {
  const explicit = process.env.UPDATER_SOCKET?.trim();
  if (explicit) return explicit;
  const root = process.env.DEPLOY_ROOT?.trim();
  return root ? join(root, "updater.sock") : null;
}

interface DaemonRequestOpts {
  method: string;
  path: string;
  body?: unknown;
}

// Generous upper bound for a daemon round-trip. /status is instant when the
// daemon's loop is free; it only stalls while the daemon is blocked on a long
// spawnSync (npm install / migrate). The timeout recovers the bridge if the
// daemon is ever truly wedged instead of waiting forever.
const DAEMON_TIMEOUT_MS = 15_000;

function daemonRequest<T>(opts: DaemonRequestOpts): Promise<T> {
  return new Promise((resolve, reject) => {
    const sock = socketPath();
    if (!sock) {
      reject(
        new HTTPException(503, {
          message:
            "Update daemon is not configured (set UPDATER_SOCKET or DEPLOY_ROOT).",
        }),
      );
      return;
    }
    const payload = opts.body !== undefined ? JSON.stringify(opts.body) : null;
    let settled = false;
    const req = http.request(
      {
        socketPath: sock,
        method: opts.method,
        path: opts.path,
        timeout: DAEMON_TIMEOUT_MS,
        headers: payload
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          let data: unknown = null;
          if (buf) {
            try {
              data = JSON.parse(buf);
            } catch {
              data = buf;
            }
          }
          const status = res.statusCode ?? 502;
          if (status >= 200 && status < 300) {
            resolve(data as T);
            return;
          }
          const message =
            (data as { message?: string } | null)?.message ||
            `Update daemon responded ${status}.`;
          reject(
            new HTTPException(
              (status >= 400 ? status : 502) as ContentfulStatusCode,
              { message },
            ),
          );
        });
      },
    );
    req.on("timeout", () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(
        new HTTPException(503, { message: "Update daemon request timed out." }),
      );
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(
        new HTTPException(503, {
          message: `Update daemon is not reachable: ${err.message}`,
        }),
      );
    });
    if (payload) req.write(payload);
    req.end();
  });
}

export async function getDaemonStatus(): Promise<UpdateStatus> {
  return daemonRequest<UpdateStatus>({ method: "GET", path: "/status" });
}

export interface DaemonApplyResponse {
  jobId: string;
}

export async function daemonApply(req: {
  tarballUrl: string;
  targetTag: string;
  mode: ApplyUpdateMode;
}): Promise<DaemonApplyResponse> {
  return daemonRequest<DaemonApplyResponse>({
    method: "POST",
    path: "/update",
    body: req,
  });
}

export async function daemonCancel(): Promise<void> {
  await daemonRequest<{ cancelled: boolean }>({
    method: "POST",
    path: "/cancel",
  });
}

// --- Status bridge: daemon /status -> event bus -> admin SSE clients ----------

const STATUS_POLL_MS = 500;
const isTerminal = (phase: UpdatePhase): boolean =>
  phase === "succeeded" || phase === "failed" || phase === "cancelled";

// `polling` stays true across the whole armed window — including the in-flight
// await — so a concurrent startUpdateStatusStream() can't schedule a second,
// racing poll that would emit duplicate events.
let polling = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastJson = "";

/** Arm the bridge for an in-flight update (called by applyUpdate / resume). */
export function startUpdateStatusStream(): void {
  if (!socketPath()) return;
  if (polling) return;
  polling = true;
  schedulePoll(0);
}

function schedulePoll(delay: number): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    void poll();
  }, delay);
}

async function poll(): Promise<void> {
  pollTimer = null;
  if (!socketPath()) {
    polling = false;
    return;
  }
  try {
    const status = await getDaemonStatus();
    const json = JSON.stringify(status);
    if (json !== lastJson) {
      lastJson = json;
      eventBus.publish({
        type: "self_update.status.updated",
        target: "sse:admin:*:*",
        phase: status.phase,
        step: status.step,
        message: status.message,
        targetTag: status.targetTag,
        mode: status.mode,
        progress: status.progress,
      });
    }
    if (isTerminal(status.phase)) {
      polling = false; // terminal — stop; re-armed by the next applyUpdate
      return;
    }
  } catch {
    // Daemon briefly unreachable (mid-redeploy restart, or blocked on a long
    // spawnSync) — keep retrying while armed.
  }
  if (polling) schedulePoll(STATUS_POLL_MS);
}

/**
 * On service boot, resume the bridge if the daemon reports an in-flight update.
 * Replaces the old stale-status-reset logic — the daemon is the source of truth
 * and handles its own interrupted-run detection. Reconnecting admin clients
 * resync current state themselves via the dialog's on-reconnect status fetch,
 * so the bridge only needs to forward changes (armed while an update runs).
 */
export async function resumeUpdateStatusStream(): Promise<void> {
  try {
    const status = await getDaemonStatus();
    if (status.phase === "running") {
      startUpdateStatusStream();
    }
  } catch {
    // Daemon not up yet (or not configured) — nothing to resume.
  }
}
