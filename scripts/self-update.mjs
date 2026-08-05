// Server-side OTA self-update runner.
//
// Spawned detached by the service (POST /api/version/update) so it survives the
// gateway being reloaded. Performs the DEPLOY.md update/redeploy flow and
// reports progress to $UPDATE_STATE_FILE (a JSON file the service reads):
//
//   update:   download → verify → extract → npm install → migrate → pm2 reload
//   redeploy: download → verify → pm2 delete all → extract → npm install
//             → prisma migrate reset → pm2 start → pm2 save
//
// Runs only with the Node runtime present on the deploy host (no workspace
// imports). Shipped inside the tarball by scripts/assemble.sh.
//
// Usage: node self-update.mjs <tarballUrl> <targetTag> [update|redeploy]
// Env:   DEPLOY_ROOT (cwd of the deploy dir), UPDATE_STATE_FILE (status json).

import { spawnSync } from "node:child_process";
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

const [tarballUrl, targetTag, modeArg = "update"] = process.argv.slice(2);
if (!["update", "redeploy"].includes(modeArg)) {
  throw new Error(`Invalid update mode: ${modeArg}`);
}
const MODE = modeArg;
const DEPLOY_ROOT = resolve(process.env.DEPLOY_ROOT || process.cwd());
const STATE_FILE =
  process.env.UPDATE_STATE_FILE || join(DEPLOY_ROOT, ".update-state.json");
const LOCK_FILE =
  process.env.UPDATE_LOCK_FILE || join(DEPLOY_ROOT, ".update-state.json.lock");
const LOG_FILE = join(DEPLOY_ROOT, ".update.log");

const logStream = createWriteStream(LOG_FILE, { flags: "a" });
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  logStream.write(`${line}\n`);
}

function setStatus(phase, step, message, progress = null) {
  const prev = readPrev();
  const status = {
    phase,
    step,
    message,
    targetTag: targetTag || prev?.targetTag || null,
    mode: MODE,
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
  const res = await fetch(url, { redirect: "follow" });
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
  await pipeline(
    Readable.fromWeb(res.body),
    new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += chunk.length;
        reportProgress();
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
  log(
    `=== self-update ${MODE} start → ${targetTag || "latest"} (root: ${DEPLOY_ROOT}) ===`,
  );

  const tmp = join(tmpdir(), `platform-deploy-${Date.now()}.tar.gz`);
  await download(tarballUrl, tmp);
  verifyTarball(tmp);

  if (MODE === "redeploy") {
    runPm2(["delete", "all"], "stopping", "Stopping PM2 apps");
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
  if (MODE === "redeploy") {
    run(
      "npx",
      ["prisma", "migrate", "reset", "--force"],
      "resetting",
      "Resetting database",
    );
    runPm2(["start", "ecosystem.config.js"], "starting", "Starting PM2");
    runPm2(["save"], "saving", "Saving PM2 process list");
  } else {
    run("npm", ["run", "migrate"], "migrating", "Running database migrations");
    runPm2(["reload", "ecosystem.config.js"], "reloading", "Reloading PM2");
  }

  setStatus(
    "succeeded",
    "done",
    MODE === "redeploy"
      ? `Redeployed ${targetTag || "latest"}`
      : `Updated to ${targetTag || "latest"}`,
  );
  log(`=== self-update ${MODE} succeeded → ${targetTag || "latest"} ===`);
}

main()
  .catch((err) => {
    log(`=== self-update ${MODE} FAILED: ${err.message} ===`);
    setStatus("failed", "error", err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    // Release the run lock so the next update can start. Ignore ENOENT — the
    // parent's exit handler may have already reclaimed it on our behalf.
    try {
      unlinkSync(LOCK_FILE);
    } catch (err) {
      if (err.code !== "ENOENT") log(`[lock] release failed: ${err.message}`);
    }
    logStream.end();
  });
