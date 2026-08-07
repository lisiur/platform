// Server-side OTA self-update runner.
//
// Spawned detached by the service (POST /api/version/update) so it survives the
// gateway being reloaded. Performs the DEPLOY.md update/redeploy flow and
// reports progress to $UPDATE_STATE_FILE (a JSON file the service reads):
//
//   update:   download → verify → extract → npm install → migrate → pm2 reload
//   redeploy: download → verify → fork → (detached) pm2 delete all → extract
//             → npm install → prisma migrate reset → pm2 start → pm2 save
//
// In redeploy mode the runner forks into a fresh detached process before
// touching PM2, so that pm2 delete all cannot kill the runner itself.
//
// Runs only with the Node runtime present on the deploy host (no workspace
// imports). Shipped inside the tarball by scripts/assemble.sh.
//
// Usage: node self-update.mjs <tarballUrl> <targetTag> [update|redeploy]
// Env:   DEPLOY_ROOT (cwd of the deploy dir), UPDATE_STATE_FILE (status json).

import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const [tarballUrl, targetTag, modeArg = "update"] = process.argv.slice(2);
if (!["update", "redeploy", "redeploy-worker"].includes(modeArg)) {
  throw new Error(`Invalid update mode: ${modeArg}`);
}
const MODE = modeArg;
// Logical mode reported in the status file. The worker runs with the internal
// argv mode "redeploy-worker" but must report the public "redeploy" value
// (the status schema only allows "update" | "redeploy").
const STATUS_MODE = MODE === "redeploy-worker" ? "redeploy" : MODE;
const DEPLOY_ROOT = resolve(process.env.DEPLOY_ROOT || process.cwd());
const STATE_FILE =
  process.env.UPDATE_STATE_FILE || join(DEPLOY_ROOT, ".update-state.json");
const LOCK_FILE =
  process.env.UPDATE_LOCK_FILE || join(DEPLOY_ROOT, ".update-state.json.lock");
const CANCEL_FILE = join(DEPLOY_ROOT, ".update-cancel");
const LOG_FILE = join(DEPLOY_ROOT, ".update.log");

// Set to true once the redeploy worker has been spawned successfully, so the
// parent's finally-block knows NOT to release the run lock (the worker owns it
// for the rest of the redeploy and releases it in its own finally-block).
let lockHandedOff = false;

const logStream = createWriteStream(LOG_FILE, { flags: "a" });
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  if (!logStream.destroyed && !logStream.writableEnded) {
    logStream.write(`${line}\n`);
  }
}

function setStatus(phase, step, message, progress = null) {
  const prev = readPrev();
  const status = {
    phase,
    step,
    message,
    targetTag: targetTag || prev?.targetTag || null,
    mode: STATUS_MODE,
    progress,
    startedAt: prev?.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, `${JSON.stringify(status, null, 2)}\n`);
}

function readPrev() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function isCancelled() {
  try {
    readFileSync(CANCEL_FILE);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, step, label) {
  log(`[${step}] $ ${cmd} ${args.join(" ")}`);
  setStatus("running", step, label);
  const result = spawnSync(cmd, args, {
    cwd: DEPLOY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.stdout) logStream.write(result.stdout);
  if (result.stderr) logStream.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${cmd} exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}

function runPm2(args, step, label) {
  try {
    run("pm2", args, step, label);
  } catch (err) {
    log(`[${step}] global pm2 failed, retrying via npx: ${err.message}`);
    run("npx", ["--yes", "pm2", ...args], step, `${label} (via npx)`);
  }
}

async function download(url, dest) {
  const label = `Downloading ${targetTag || "latest"}`;
  setStatus("running", "downloading", label, {
    downloadedBytes: 0,
    totalBytes: null,
    percent: null,
  });
  log(`[downloading] ${url}`);
  const controller = new AbortController();
  const res = await fetch(url, {
    redirect: "follow",
    signal: controller.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const totalBytes = Number(res.headers.get("content-length"));
  const total =
    Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null;
  let downloadedBytes = 0;
  let lastStatusAt = 0;
  const reportProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastStatusAt < 500) return;
    lastStatusAt = now;
    setStatus("running", "downloading", label, {
      downloadedBytes,
      totalBytes: total,
      percent: total
        ? Math.min(100, Math.round((downloadedBytes / total) * 100))
        : null,
    });
  };
  let cancelCheckedAt = 0;
  await pipeline(
    Readable.fromWeb(res.body),
    new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += chunk.length;
        reportProgress();
        const now = Date.now();
        if (now - cancelCheckedAt > 500) {
          cancelCheckedAt = now;
          if (isCancelled()) {
            const cancelErr = new Error("Update cancelled by user");
            cancelErr.name = "AbortError";
            cancelErr.code = "ABORT_ERR";
            controller.abort();
            callback(cancelErr);
            return;
          }
        }
        callback(null, chunk);
      },
    }),
    createWriteStream(dest),
  );
  reportProgress(true);
}

function verifyTarball(file) {
  setStatus("running", "verifying", "Verifying tarball");
  const result = spawnSync("tar", ["-tzf", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Tarball is not valid gzip: ${result.stderr}`);
  }
  const listing = result.stdout;
  for (const marker of ["ecosystem.config.js", "package.json"]) {
    if (!listing.split("\n").some((l) => l.endsWith(marker))) {
      throw new Error(`Tarball missing expected entry: ${marker}`);
    }
  }
}

async function main() {
  if (!tarballUrl) throw new Error("Missing tarballUrl argument");

  // Clear any stale cancel sentinel from a previous crashed run so it can't
  // abort this download before it starts.
  try {
    unlinkSync(CANCEL_FILE);
  } catch {}

  if (MODE === "redeploy-worker") {
    const tarballPath = process.argv[5];
    await redeployWorker(tarballPath);
    return;
  }

  log(
    `=== self-update ${MODE} start → ${targetTag || "latest"} (root: ${DEPLOY_ROOT}) ===`,
  );

  const tmp = join(tmpdir(), `platform-deploy-${Date.now()}.tar.gz`);
  await download(tarballUrl, tmp);

  try {
    unlinkSync(CANCEL_FILE);
  } catch {}

  verifyTarball(tmp);

  if (MODE === "redeploy") {
    setStatus("running", "forking", "Forking redeploy worker");
    const script = fileURLToPath(import.meta.url);
    const worker = spawn(
      process.execPath,
      [script, tarballUrl, targetTag, "redeploy-worker", tmp],
      {
        cwd: DEPLOY_ROOT,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          DEPLOY_ROOT,
          UPDATE_STATE_FILE: STATE_FILE,
          UPDATE_LOCK_FILE: LOCK_FILE,
        },
      },
    );
    worker.on("spawn", () => {
      worker.unref();
    });
    worker.on("error", (err) => {
      setStatus(
        "failed",
        "forking",
        `Failed to spawn redeploy worker: ${err.message}`,
      );
      try {
        unlinkSync(LOCK_FILE);
      } catch {}
      log(`Failed to spawn redeploy worker: ${err.message}`);
    });
    lockHandedOff = true;

    // Don't write a terminal status — the worker owns status from here and
    // will report "succeeded"/"failed" when the redeploy actually completes.
    log(`=== self-update ${MODE} launched → ${targetTag || "latest"} ===`);
    return;
  }

  run(
    "tar",
    ["-xzf", tmp, "-C", DEPLOY_ROOT],
    "extracting",
    "Extracting tarball",
  );
  run(
    "npm",
    ["install", "--no-audit", "--no-fund"],
    "installing",
    "Installing dependencies",
  );

  run("npm", ["run", "migrate"], "migrating", "Running database migrations");
  runPm2(["reload", "ecosystem.config.js"], "reloading", "Reloading PM2");

  setStatus("succeeded", "done", `Updated to ${targetTag || "latest"}`);
  log(`=== self-update ${MODE} succeeded → ${targetTag || "latest"} ===`);
}

async function redeployWorker(tarballPath) {
  try {
    log(
      `=== self-update redeploy worker start → ${targetTag || "latest"} (root: ${DEPLOY_ROOT}) ===`,
    );

    log(`[worker] sleeping 2s to let parent exit cleanly`);
    await new Promise((r) => setTimeout(r, 2000));

    runPm2(["delete", "all"], "stopping", "Stopping PM2 apps");

    run(
      "tar",
      ["-xzf", tarballPath, "-C", DEPLOY_ROOT],
      "extracting",
      "Extracting tarball",
    );
    run(
      "npm",
      ["install", "--no-audit", "--no-fund"],
      "installing",
      "Installing dependencies",
    );
    run(
      "npx",
      ["prisma", "migrate", "reset", "--force"],
      "resetting",
      "Resetting database",
    );
    runPm2(["start", "ecosystem.config.js"], "starting", "Starting PM2");
    runPm2(["save"], "saving", "Saving PM2 process list");

    try {
      unlinkSync(tarballPath);
    } catch {}

    setStatus("succeeded", "done", `Redeployed ${targetTag || "latest"}`);
    log(
      `=== self-update redeploy worker succeeded → ${targetTag || "latest"} ===`,
    );
  } catch (err) {
    log(`=== self-update redeploy worker FAILED: ${err.message} ===`);
    setStatus("failed", "error", err.message);
    process.exitCode = 1;
  } finally {
    try {
      unlinkSync(CANCEL_FILE);
    } catch {}
    try {
      unlinkSync(LOCK_FILE);
    } catch (err) {
      if (err.code !== "ENOENT") log(`[lock] release failed: ${err.message}`);
    }
    logStream.end();
    // Exit directly so we don't fall through to main()'s finally-block, which
    // would double-release the lock and double-close the log stream.
    process.exit(process.exitCode || 0);
  }
}

main()
  .catch((err) => {
    if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
      log(`=== self-update ${MODE} cancelled by user ===`);
      setStatus("cancelled", "cancelled", "Update cancelled by user");
    } else {
      log(`=== self-update ${MODE} FAILED: ${err.message} ===`);
      setStatus("failed", "error", err.message);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      unlinkSync(CANCEL_FILE);
    } catch {}
    // In redeploy mode the lock was handed off to the detached worker — don't
    // release it here, or a second update could start while the worker runs.
    if (!lockHandedOff) {
      try {
        unlinkSync(LOCK_FILE);
      } catch (err) {
        if (err.code !== "ENOENT") log(`[lock] release failed: ${err.message}`);
      }
    }
    logStream.end();
  });
