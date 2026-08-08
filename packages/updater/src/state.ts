import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MARKER_FILE, STATE_FILE } from "./config";
import { log } from "./log";
import type { UpdateStatus } from "./types";

const IDLE: UpdateStatus = {
  phase: "idle",
  step: "",
  message: "",
  targetTag: null,
  mode: null,
  progress: null,
  startedAt: null,
  updatedAt: null,
};

let current = loadInitial();
const subscribers = new Set<(status: UpdateStatus) => void>();

export function getStatus(): UpdateStatus {
  return current;
}

export function setStatus(next: UpdateStatus): void {
  current = next;
  persist(next);
  notify(next);
}

// Merge a partial update over the current status (used for streaming progress).
export function patch(partial: Partial<UpdateStatus>): void {
  setStatus({ ...current, ...partial, updatedAt: new Date().toISOString() });
}

export function subscribe(fn: (status: UpdateStatus) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function notify(status: UpdateStatus): void {
  for (const fn of subscribers) {
    try {
      fn(status);
    } catch (err) {
      log(`[state] subscriber error: ${(err as Error).message}`);
    }
  }
}

function persist(status: UpdateStatus): void {
  try {
    writeFileSync(STATE_FILE, `${JSON.stringify(status, null, 2)}\n`);
  } catch (err) {
    log(`[state] failed to persist: ${(err as Error).message}`);
  }
}

function loadInitial(): UpdateStatus {
  // An active run marker survived a daemon restart → the run was interrupted.
  if (existsSync(MARKER_FILE)) {
    return {
      ...IDLE,
      phase: "failed",
      step: "interrupted",
      message:
        "Daemon restarted mid-update — deploy dir may be inconsistent. Re-run the update to recover.",
      updatedAt: new Date().toISOString(),
    };
  }
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8")) as UpdateStatus;
    // A saved "running" status with no active marker is stale (the run is not
    // actually live) — reset to idle so the UI doesn't show a phantom run.
    if (saved.phase === "running") {
      return { ...IDLE };
    }
    return { ...saved, progress: saved.progress ?? null };
  } catch {
    return { ...IDLE };
  }
}
