import { spawnSync } from "node:child_process";
import { createWriteStream, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEPLOY_ROOT, MARKER_FILE } from "./config";
import { log } from "./log";
import { deleteApps, reloadApps, saveProcessList, startApps } from "./pm2";
import { getStatus, patch, setStatus } from "./state";
import type { ApplyRequest } from "./types";

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
    verifyTarball(tarball);

    if (req.mode === "redeploy") {
      // Stop apps first so they release DB connections before the reset.
      deleteApps();
      run(
        "tar",
        ["-xzf", tarball, "-C", DEPLOY_ROOT],
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
      startApps();
      saveProcessList();
    } else {
      run(
        "tar",
        ["-xzf", tarball, "-C", DEPLOY_ROOT],
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
        "npm",
        ["run", "migrate"],
        "migrating",
        "Running database migrations",
      );
      reloadApps();
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
          callback(null, chunk);
        },
      }),
      createWriteStream(dest),
    );
    report(true);
  } finally {
    activeController = null;
  }
}

function verifyTarball(file: string): void {
  patch({ step: "verifying", message: "Verifying tarball", progress: null });
  const result = spawnSync("tar", ["-tzf", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Tarball is not valid gzip: ${result.stderr}`);
  }
  // Guard against a release that's missing the updater itself, which would
  // brick self-update once deployed.
  for (const marker of ["ecosystem.config.js", "updater.mjs", "package.json"]) {
    if (!result.stdout.split("\n").some((l) => l.endsWith(marker))) {
      throw new Error(`Tarball missing expected entry: ${marker}`);
    }
  }
}

function run(cmd: string, args: string[], step: string, label: string): void {
  log(`[${step}] $ ${cmd} ${args.join(" ")}`);
  patch({ step, message: label, progress: null });
  const result = spawnSync(cmd, args, {
    cwd: DEPLOY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) log(result.stdout.trim());
  if (result.stderr) log(result.stderr.trim());
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${cmd} exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}
