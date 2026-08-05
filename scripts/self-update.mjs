// Server-side OTA self-update runner.
//
// Spawned detached by the service (POST /api/version/update) so it survives the
// gateway being reloaded. Performs the DEPLOY.md update flow atomically and
// reports progress to $UPDATE_STATE_FILE (a JSON file the service reads):
//
//   download → verify → extract → npm install → migrate → pm2 reload
//
// Runs only with the Node runtime present on the deploy host (no workspace
// imports). Shipped inside the tarball by scripts/assemble.sh.
//
// Usage: node self-update.mjs <tarballUrl> <targetTag>
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
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [tarballUrl, targetTag] = process.argv.slice(2);
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

function setStatus(phase, step, message) {
  const prev = readPrev();
  const status = {
    phase,
    step,
    message,
    targetTag: targetTag || prev?.targetTag || null,
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
  if (result.stdout) logStream.write(result.stdout);
  if (result.stderr) logStream.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${cmd} exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}

async function download(url, dest) {
  setStatus("running", "downloading", `Downloading ${targetTag || "latest"}`);
  log(`[downloading] ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
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
    `=== self-update start → ${targetTag || "latest"} (root: ${DEPLOY_ROOT}) ===`,
  );

  const tmp = join(tmpdir(), `platform-deploy-${Date.now()}.tar.gz`);
  await download(tarballUrl, tmp);
  verifyTarball(tmp);

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

  // Reload PM2. Prefer the global pm2; fall back to npx if not on PATH.
  try {
    run("pm2", ["reload", "ecosystem.config.js"], "reloading", "Reloading PM2");
  } catch (err) {
    log(`[reloading] global pm2 failed, retrying via npx: ${err.message}`);
    run(
      "npx",
      ["--yes", "pm2", "reload", "ecosystem.config.js"],
      "reloading",
      "Reloading PM2 (via npx)",
    );
  }

  setStatus("succeeded", "done", `Updated to ${targetTag || "latest"}`);
  log(`=== self-update succeeded → ${targetTag || "latest"} ===`);
}

main()
  .catch((err) => {
    log(`=== self-update FAILED: ${err.message} ===`);
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
