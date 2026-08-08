import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_ROOT } from "./config";
import { log } from "./log";
import { type SpawnResult, spawnAsync } from "./spawn";
import { patch } from "./state";

// The three application processes. The updater runs in its OWN ecosystem file
// (updater.config.js), so these names never include itself — every helper here
// is structurally incapable of restarting the daemon mid-update.
const APPS = ["gateway", "admin", "organization"];
const ECOSYSTEM_FILE = join(DEPLOY_ROOT, "ecosystem.config.js");

interface RunOpts {
  timeoutMs?: number;
}

// Run a pm2 invocation, retrying via npx if the global pm2 binary is missing or
// exits non-zero (skip the retry on timeout — re-running against the same hung
// daemon just burns the window again). Each step also publishes its status so
// the UI shows stopping/starting/reloading/saving instead of jumping straight
// to the next visible step.
async function invoke(
  cmd: string,
  args: string[],
  opts?: RunOpts,
): Promise<SpawnResult> {
  try {
    return await spawnAsync(cmd, args, {
      cwd: DEPLOY_ROOT,
      timeoutMs: opts?.timeoutMs,
    });
  } catch (err) {
    // Spawn-level failure (e.g. ENOENT — no global pm2). Surface as a non-zero
    // result so the npx retry path handles it uniformly.
    return {
      code: -1,
      signal: null,
      stdout: "",
      stderr: (err as Error).message,
      timedOut: false,
    };
  }
}

async function runPm2(
  args: string[],
  step: string,
  label: string,
  opts?: RunOpts,
): Promise<void> {
  log(`[${step}] $ pm2 ${args.join(" ")} (cwd: ${DEPLOY_ROOT})`);
  patch({ step, message: label, progress: null });

  const first = await invoke("pm2", args, opts);
  if (first.stdout) log(first.stdout.trim());
  if (first.stderr) log(first.stderr.trim());
  if (first.timedOut)
    throw new Error(`${label} timed out after ${opts?.timeoutMs}ms`);
  if (first.code === 0) return;

  log(`[${step}] global pm2 failed (exit ${first.code}), retrying via npx`);
  const retry = await invoke("npx", ["--yes", "pm2", ...args], opts);
  if (retry.stdout) log(retry.stdout.trim());
  if (retry.stderr) log(retry.stderr.trim());
  if (retry.timedOut)
    throw new Error(`${label} timed out after ${opts?.timeoutMs}ms`);
  if (retry.code !== 0) {
    throw new Error(
      `${label} failed (pm2 exit ${first.code} / npx exit ${retry.code}): ${retry.stderr || retry.stdout}`,
    );
  }
}

// Normal update: restart the three apps to pick up the newly extracted code.
//
// NOTE: `restart` causes brief downtime (old process killed, then new one
// starts). `pm2 reload` would achieve zero-downtime, but ONLY in cluster mode
// — it relies on the app handling a graceful-shutdown signal while a new
// instance boots. The apps currently run in fork mode (single instance, no
// signal handler), so `reload` silently leaves the old process running with
// stale code. Switch back to `reload` once the apps move to cluster mode
// (exec_mode: "cluster", instances > 1) to get rolling zero-downtime updates.
export async function reloadApps(): Promise<void> {
  await runPm2(["restart", ...APPS], "reloading", "Restarting PM2 apps", {
    timeoutMs: 30000,
  });
}

// Redeploy: stop and remove the three apps (keeps the PM2 god + this daemon
// alive). Replaces the old `pm2 kill` + `pkill -9 -f pm2` dance.
export async function deleteApps(): Promise<void> {
  await runPm2(["delete", ...APPS], "stopping", "Stopping PM2 apps", {
    timeoutMs: 20000,
  });
}

// Redeploy: re-launch the three apps from the app ecosystem file. The updater
// lives in a separate file, so it is unaffected.
export async function startApps(): Promise<void> {
  // Log the exact script paths PM2 is about to load, with an existence check,
  // so a missing-artifact failure is obvious in updater.log instead of a silent
  // "App [updater] launched" surprise.
  for (const name of APPS) {
    const script = join(DEPLOY_ROOT, "apps", name, "apps", name, "server.js");
    log(
      `[starting] expect ${name} → ${script} (exists: ${existsSync(script)})`,
    );
  }
  await runPm2(["start", ECOSYSTEM_FILE], "starting", "Starting PM2 apps", {
    timeoutMs: 60000,
  });
  await verifyAppsOnline();
}

export async function saveProcessList(): Promise<void> {
  await runPm2(["save"], "saving", "Saving PM2 process list");
}

// Confirm the three apps actually came online after `pm2 start`. If they didn't
// (bad script path, crash on boot, PM2 quirk), surface it loudly with the real
// process table so the failure is debuggable instead of looking like "success".
// Throws so the pipeline reports failure instead of a misleading "succeeded".
async function verifyAppsOnline(): Promise<void> {
  // Give PM2 a moment to transition processes from "launching" to "online".
  await new Promise((r) => setTimeout(r, 2000));
  const procs = await listProcesses();
  const byName = new Map(procs.map((p) => [p.name, p.status]));
  const missing = APPS.filter((n) => !byName.has(n));
  const notOnline = APPS.filter(
    (n) => byName.has(n) && byName.get(n) !== "online",
  );
  if (missing.length > 0 || notOnline.length > 0) {
    const table =
      procs.map((p) => `${p.name}=${p.status}`).join(", ") || "(none)";
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
    if (notOnline.length > 0)
      parts.push(
        `not online: ${notOnline.map((n) => `${n}=${byName.get(n)}`).join(", ")}`,
      );
    const msg = `Apps not online after start — ${parts.join("; ")}. PM2 now has: ${table}.`;
    log(`[starting] FAILED — ${msg}`);
    throw new Error(msg);
  }
  log(`[starting] apps online: ${APPS.map((n) => `${n}=online`).join(", ")}`);
}

interface Pm2Proc {
  name?: string;
  pm2_env?: { status?: string };
}

async function listProcesses(): Promise<
  Array<{ name: string; status: string }>
> {
  let result: SpawnResult;
  try {
    result = await spawnAsync("pm2", ["jlist"], { cwd: DEPLOY_ROOT });
  } catch {
    return [];
  }
  if (result.code !== 0 || !result.stdout) return [];
  try {
    const list = JSON.parse(result.stdout) as Pm2Proc[];
    return list.map((p) => ({
      name: p.name ?? "?",
      status: p.pm2_env?.status ?? "unknown",
    }));
  } catch {
    return [];
  }
}
