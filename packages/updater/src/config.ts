import { join, resolve } from "node:path";

// The daemon operates inside the deploy dir (PM2 starts it with cwd: ".").
// DEPLOY_ROOT is the source of truth; cwd is a fallback for manual runs.
export const DEPLOY_ROOT = resolve(process.env.DEPLOY_ROOT || process.cwd());

// Unix socket the service connects to. Restricted to the deploy user via
// chmod 0600 at listen time (see server.ts) — no auth token needed.
export const SOCKET_PATH =
  process.env.UPDATER_SOCKET?.trim() || join(DEPLOY_ROOT, "updater.sock");

// Persisted last-known status (for the admin UI to show after a daemon
// restart). NOT a coordination channel — the in-memory state is authoritative.
export const STATE_FILE =
  process.env.UPDATER_STATE_FILE?.trim() ||
  join(DEPLOY_ROOT, "updater-state.json");

// Presence of this file means a run is active. If it exists at boot, the
// previous run was interrupted by a daemon crash — surfaced as failed.
export const MARKER_FILE = join(DEPLOY_ROOT, "updater.marker");

export const LOG_FILE =
  process.env.UPDATER_LOG_FILE?.trim() || join(DEPLOY_ROOT, "updater.log");
