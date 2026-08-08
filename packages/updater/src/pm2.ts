import { spawnSync } from "node:child_process";
import { log } from "./log";

// The three application processes. The updater runs in its OWN ecosystem file
// (updater.config.js), so these names never include itself — every helper here
// is structurally incapable of restarting the daemon mid-update.
const APPS = ["gateway", "admin", "organization"];

interface RunOpts {
  timeoutMs?: number;
}

function runPm2(
  args: string[],
  step: string,
  label: string,
  opts?: RunOpts,
): void {
  log(`[${step}] $ pm2 ${args.join(" ")}`);
  const result = spawnSync("pm2", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts?.timeoutMs,
    killSignal: "SIGKILL",
  });
  if (result.stdout) log(result.stdout.trim());
  if (result.stderr) log(result.stderr.trim());
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (opts?.timeoutMs && result.signal === "SIGKILL") {
    throw new Error(`${label} timed out after ${opts.timeoutMs}ms`);
  }
  if (result.status === 0) return;

  // Retry via npx for hosts without a global pm2 install. Skip on timeout:
  // re-running against the same hung daemon just burns the window again.
  log(`[${step}] global pm2 failed (exit ${result.status}), retrying via npx`);
  const retry = spawnSync("npx", ["--yes", "pm2", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts?.timeoutMs,
    killSignal: "SIGKILL",
  });
  if (retry.stdout) log(retry.stdout.trim());
  if (retry.stderr) log(retry.stderr.trim());
  if (retry.error) throw new Error(`${label} failed: ${retry.error.message}`);
  if (opts?.timeoutMs && retry.signal === "SIGKILL") {
    throw new Error(`${label} timed out after ${opts.timeoutMs}ms`);
  }
  if (retry.status !== 0) {
    throw new Error(
      `${label} failed (pm2 exit ${result.status} / npx exit ${retry.status}): ${retry.stderr || retry.stdout}`,
    );
  }
}

// Normal update: zero-downtime rolling reload of the three apps. By-name reload
// is scoped to exactly these processes regardless of ecosystem files.
export function reloadApps(): void {
  runPm2(["reload", ...APPS], "reloading", "Reloading PM2 apps", {
    timeoutMs: 30000,
  });
}

// Redeploy: stop and remove the three apps (keeps the PM2 god + this daemon
// alive). Replaces the old `pm2 kill` + `pkill -9 -f pm2` dance.
export function deleteApps(): void {
  runPm2(["delete", ...APPS], "stopping", "Stopping PM2 apps", {
    timeoutMs: 20000,
  });
}

// Redeploy: re-launch the three apps from the app ecosystem file. The updater
// lives in a separate file, so it is unaffected.
export function startApps(): void {
  runPm2(["start", "ecosystem.config.js"], "starting", "Starting PM2 apps", {
    timeoutMs: 60000,
  });
}

export function saveProcessList(): void {
  runPm2(["save"], "saving", "Saving PM2 process list");
}
