import { createWriteStream, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEPLOY_ROOT, MARKER_FILE } from "./config";
import { log } from "./log";
import { deleteApps, reloadApps, saveProcessList, startApps } from "./pm2";
import { type SpawnResult, spawnAsync } from "./spawn";
import { getStatus, patch, setStatus } from "./state";
import type { ApplyRequest } from "./types";

// Abort a download if the transfer goes silent for this long. A stalled CDN
// connection would otherwise hang forever at the last reported percent (the
// original "stuck at 91%" symptom) with no detection or recovery.
const STALL_TIMEOUT_MS = 30_000;

// Extraction hardening flags. The updater downloads an unsigned tarball and
// extracts it as the deploy user followed by an automatic pm2 restart, so do
// not let attacker-controlled entries dictate ownership or directory metadata.
const TAR_EXTRACT_FLAGS = ["--no-same-owner", "--no-overwrite-dir"];

// True for a tar entry name or symlink target that would escape DEPLOY_ROOT:
// an absolute path, a backslash-variant of one, or any ".." path segment. Such
// an entry is the tar-slip / path-traversal vector (e.g.
// "../../../.ssh/authorized_keys") and means code execution on extraction.
function isEscapingTarPath(raw: string): boolean {
  const p = raw.replace(/\\/g, "/").trim();
  if (!p || p.startsWith("/")) return true;
  return p.split("/").some((seg) => seg === "..");
}

// Active download controller — the only cancellable phase. null outside the
// download step, so POST /cancel is rejected once extraction has begun.
let activeController: AbortController | null = null;
let cancelRequested = false;

export function isCancellable(): boolean {
  return activeController !== null && !cancelRequested;
}

export function requestCancel(): boolean {
  if (!activeController || cancelRequested) return false;
  cancelRequested = true;
  activeController.abort();
  return true;
}

export async function runPipeline(req: ApplyRequest): Promise<void> {
  cancelRequested = false;
  writeFileSync(MARKER_FILE, `${JSON.stringify({ since: Date.now() })}\n`);

  const now = new Date().toISOString();
  setStatus({
    phase: "running",
    step: "queued",
    message:
      req.mode === "redeploy"
        ? `Preparing redeploy to ${req.targetTag}`
        : `Preparing update to ${req.targetTag}`,
    targetTag: req.targetTag,
    mode: req.mode,
    progress: null,
    startedAt: now,
    updatedAt: now,
  });
  log(`=== ${req.mode} start → ${req.targetTag} (root: ${DEPLOY_ROOT}) ===`);

  try {
    const tarball = join(tmpdir(), `platform-deploy-${Date.now()}.tar.gz`);
    await download(req.tarballUrl, tarball, req.targetTag);
    await verifyTarball(tarball);

    if (req.mode === "redeploy") {
      // Stop apps first so they release DB connections before the reset.
      await deleteApps();
      await run(
        "tar",
        ["-xzf", tarball, "-C", DEPLOY_ROOT, ...TAR_EXTRACT_FLAGS],
        "extracting",
        "Extracting tarball",
      );
      await run(
        "npm",
        ["install", "--no-audit", "--no-fund"],
        "installing",
        "Installing dependencies",
      );
      await run(
        "npx",
        ["prisma", "migrate", "reset", "--force"],
        "resetting",
        "Resetting database",
      );
      await startApps();
      await saveProcessList();
    } else {
      await run(
        "tar",
        ["-xzf", tarball, "-C", DEPLOY_ROOT, ...TAR_EXTRACT_FLAGS],
        "extracting",
        "Extracting tarball",
      );
      await run(
        "npm",
        ["install", "--no-audit", "--no-fund"],
        "installing",
        "Installing dependencies",
      );
      await run(
        "npm",
        ["run", "migrate"],
        "migrating",
        "Running database migrations",
      );
      await reloadApps();
    }

    setStatus({
      phase: "succeeded",
      step: "done",
      message:
        req.mode === "redeploy"
          ? `Redeployed ${req.targetTag}`
          : `Updated to ${req.targetTag}`,
      targetTag: req.targetTag,
      mode: req.mode,
      progress: null,
      startedAt: getStatus().startedAt,
      updatedAt: new Date().toISOString(),
    });
    log(`=== ${req.mode} succeeded → ${req.targetTag} ===`);
  } catch (err) {
    const e = err as Error & { code?: string };
    const cancelled =
      cancelRequested ||
      e.name === "AbortError" ||
      e.code === "ABORT_ERR" ||
      e.message?.includes("Update cancelled by user");
    if (cancelled) {
      setStatus({
        phase: "cancelled",
        step: "cancelled",
        message: "Update cancelled by user",
        targetTag: req.targetTag,
        mode: req.mode,
        progress: null,
        startedAt: getStatus().startedAt,
        updatedAt: new Date().toISOString(),
      });
      log(`=== ${req.mode} cancelled → ${req.targetTag} ===`);
    } else {
      setStatus({
        phase: "failed",
        step: "error",
        message: e.message,
        targetTag: req.targetTag,
        mode: req.mode,
        progress: null,
        startedAt: getStatus().startedAt,
        updatedAt: new Date().toISOString(),
      });
      log(`=== ${req.mode} FAILED → ${req.targetTag}: ${e.message} ===`);
    }
  } finally {
    activeController = null;
    cancelRequested = false;
    try {
      unlinkSync(MARKER_FILE);
    } catch {
      // already removed
    }
  }
}

async function download(
  url: string,
  dest: string,
  targetTag: string,
): Promise<void> {
  const label = `Downloading ${targetTag}`;
  patch({
    step: "downloading",
    message: label,
    progress: { downloadedBytes: 0, totalBytes: null, percent: null },
  });
  log(`[downloading] ${url}`);

  const controller = new AbortController();
  activeController = controller;
  // Distinguishes a stall-driven abort (→ failed) from a user cancel (→
  // cancelled). Both abort the same controller, so the flag is the only signal.
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      log(`[downloading] no data for ${STALL_TIMEOUT_MS / 1000}s — aborting`);
      controller.abort();
    }, STALL_TIMEOUT_MS);
  };

  armStall();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const headerTotal = Number(res.headers.get("content-length"));
    const total =
      Number.isFinite(headerTotal) && headerTotal > 0 ? headerTotal : null;
    let downloadedBytes = 0;
    let lastReport = 0;
    const report = (force: boolean) => {
      const t = Date.now();
      if (!force && t - lastReport < 200) return;
      lastReport = t;
      patch({
        progress: {
          downloadedBytes,
          totalBytes: total,
          percent: total
            ? Math.min(100, Math.round((downloadedBytes / total) * 100))
            : null,
        },
      });
    };

    await pipeline(
      Readable.fromWeb(res.body),
      new Transform({
        transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          report(false);
          armStall();
          callback(null, chunk);
        },
      }),
      createWriteStream(dest),
    );
    report(true);
  } catch (err) {
    if (stalled) {
      throw new Error(
        `Download stalled — no data received for ${STALL_TIMEOUT_MS / 1000}s.`,
      );
    }
    throw err;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    activeController = null;
  }
}

async function verifyTarball(file: string): Promise<void> {
  // Intentionally NOT resetting progress to null here: the download just
  // reached 100%, and the async spawn below keeps the event loop responsive so
  // the status bridge can actually observe that 100% state before the next step
  // (extracting) clears it. Clobbering it synchronously (the old behavior) made
  // the 100% state last microseconds — unobservable by the 500ms poll.
  patch({ step: "verifying", message: "Verifying tarball" });
  let result: SpawnResult;
  try {
    result = await spawnAsync("tar", ["-tzf", file], { cwd: DEPLOY_ROOT });
  } catch (err) {
    throw new Error(`Verifying tarball failed: ${(err as Error).message}`);
  }
  if (result.code !== 0) {
    throw new Error(`Tarball is not valid gzip: ${result.stderr}`);
  }
  const names = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Guard against a release that's missing the updater itself, which would
  // brick self-update once deployed.
  for (const marker of ["ecosystem.config.js", "updater.mjs", "package.json"]) {
    if (!names.some((l) => l.endsWith(marker))) {
      throw new Error(`Tarball missing expected entry: ${marker}`);
    }
  }

  // Tar-slip / path-traversal defense: reject any entry that would extract
  // outside DEPLOY_ROOT (absolute paths, ".." segments). This is verified before
  // extraction because extraction runs as the deploy user and is immediately
  // followed by a pm2 restart — a single escaping entry is code execution.
  for (const name of names) {
    if (isEscapingTarPath(name)) {
      throw new Error(`Refusing tarball: unsafe entry path "${name}"`);
    }
  }

  // Symlink vector: a symlink pointing outside DEPLOY_ROOT lets a later entry
  // write through it. Inspect the verbose listing for symlink ("l") entries and
  // reject escaping link targets.
  let verbose: SpawnResult;
  try {
    verbose = await spawnAsync("tar", ["-tvf", file], { cwd: DEPLOY_ROOT });
  } catch (err) {
    throw new Error(`Verifying tarball failed: ${(err as Error).message}`);
  }
  if (verbose.code !== 0) {
    throw new Error(`Tarball listing failed: ${verbose.stderr}`);
  }
  for (const line of verbose.stdout.split("\n")) {
    if (line?.[0] !== "l") continue;
    const arrow = line.lastIndexOf(" -> ");
    if (arrow === -1) continue;
    const target = line.slice(arrow + 4).trim();
    if (isEscapingTarPath(target)) {
      throw new Error(`Refusing tarball: unsafe symlink target "${target}"`);
    }
  }
}

async function run(
  cmd: string,
  args: string[],
  step: string,
  label: string,
): Promise<void> {
  log(`[${step}] $ ${cmd} ${args.join(" ")}`);
  patch({ step, message: label, progress: null });
  let result: SpawnResult;
  try {
    result = await spawnAsync(cmd, args, { cwd: DEPLOY_ROOT });
  } catch (err) {
    throw new Error(`${label} failed: ${(err as Error).message}`);
  }
  if (result.stdout) log(result.stdout.trim());
  if (result.stderr) log(result.stderr.trim());
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (${cmd} exit ${result.code}): ${result.stderr || result.stdout}`,
    );
  }
}
