import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_TIME, APP_GIT_SHA, APP_VERSION } from "@repo/shared";
import { HTTPException } from "hono/http-exception";

const GITHUB_API = "https://api.github.com";
const DEFAULT_GITHUB_REPO = "lisiur/platform";

export interface VersionInfo {
  version: string;
  gitSha: string;
  buildTime: string;
}

export interface LatestRelease {
  tag: string;
  name: string | null;
  htmlUrl: string;
  publishedAt: string;
  tarballUrl: string;
  tarballSize: number;
  newer: boolean;
}

interface UpdateRelease {
  tag: string;
  name: string | null;
  htmlUrl: string;
  publishedAt: string;
  tarballUrl: string;
  tarballSize: number;
}

interface UpdateSourceProvider {
  getLatestRelease(): Promise<UpdateRelease>;
  getReleaseByTag(tag: string): Promise<UpdateRelease>;
}

export type UpdatePhase = "idle" | "running" | "succeeded" | "failed";
export type ApplyUpdateMode = "update" | "redeploy";

export interface UpdateStatus {
  phase: UpdatePhase;
  step: string;
  message: string;
  targetTag: string | null;
  mode: ApplyUpdateMode | null;
  progress: {
    downloadedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  } | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export function getVersionInfo(): VersionInfo {
  return {
    version: APP_VERSION,
    gitSha: APP_GIT_SHA,
    buildTime: APP_BUILD_TIME,
  };
}

export function isSelfUpdateEnabled(): boolean {
  return process.env.SELF_UPDATE_ENABLED === "true";
}

function assertSelfUpdateEnabled(): void {
  if (!isSelfUpdateEnabled()) {
    throw new HTTPException(403, {
      message:
        "Self-update is disabled on this server (SELF_UPDATE_ENABLED!=true).",
    });
  }
}

export function deployRoot(): string {
  const root = process.env.DEPLOY_ROOT?.trim();
  if (!root) {
    throw new HTTPException(503, {
      message: "DEPLOY_ROOT is required to run self-update.",
    });
  }
  return root;
}

function stateFile(): string {
  return (
    process.env.UPDATE_STATE_FILE?.trim() ||
    join(/*turbopackIgnore: true*/ deployRoot(), ".update-state.json")
  );
}

// Lock held for the lifetime of an update run (acquire here, release in the
// detached runner via $UPDATE_LOCK_FILE). Guards against two concurrent
// POST /version/update requests both passing a status check and spawning
// racing runners. The 'wx' flag makes acquire atomic (O_EXCL); a stale lock
// older than the timeout is reclaimed so a hard crash can't wedge updates.
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;

function lockFile(): string {
  return `${stateFile()}.lock`;
}

function acquireLock(): void {
  const path = lockFile();
  const stamp = () => JSON.stringify({ since: Date.now() });
  try {
    writeFileSync(/*turbopackIgnore: true*/ path, stamp(), { flag: "wx" });
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  // Lock exists — reclaim it if it's been held past the timeout (the holder
  // crashed without releasing). Unlink-then-retry closes the reclaim race
  // against a third request: only one unlink succeeds, the other's 'wx' open
  // fails and we report in-progress.
  let since = 0;
  try {
    since =
      JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")).since ??
      0;
  } catch {
    // unreadable — treat as reclaimable
  }
  if (Date.now() - since < LOCK_TIMEOUT_MS) {
    throw new HTTPException(409, {
      message: "An update is already in progress.",
    });
  }
  try {
    unlinkSync(/*turbopackIgnore: true*/ path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  try {
    writeFileSync(/*turbopackIgnore: true*/ path, stamp(), { flag: "wx" });
  } catch {
    throw new HTTPException(409, {
      message: "An update is already in progress.",
    });
  }
}

function releaseLock(): void {
  try {
    unlinkSync(/*turbopackIgnore: true*/ lockFile());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function readUpdateStatus(): UpdateStatus {
  try {
    const raw = readFileSync(/*turbopackIgnore: true*/ stateFile(), "utf8");
    const status = JSON.parse(raw) as UpdateStatus;
    return { ...status, progress: status.progress ?? null };
  } catch {
    return {
      phase: "idle",
      step: "",
      message: "",
      targetTag: null,
      mode: null,
      progress: null,
      startedAt: null,
      updatedAt: null,
    };
  }
}

function writeUpdateStatus(status: UpdateStatus): void {
  writeFileSync(
    /*turbopackIgnore: true*/ stateFile(),
    `${JSON.stringify(status, null, 2)}\n`,
  );
}

interface SemverParts {
  core: [number, number, number];
  pre: string[] | null;
}

function parseSemver(v: string): SemverParts {
  const m = v.match(/(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?/);
  if (!m) return { core: [0, 0, 0], pre: null };
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : null,
  };
}

// Per semver: a release without a prerelease suffix has higher precedence
// than one with; numeric identifiers compare numerically and are lower than
// alphanumeric; more fields win when all preceding identifiers are equal.
function comparePrerelease(a: string[] | null, b: string[] | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const aNum = /^\d+$/.test(a[i]);
    const bNum = /^\d+$/.test(b[i]);
    if (aNum && bNum) {
      const diff = Number(a[i]) - Number(b[i]);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  }
  return comparePrerelease(a.pre, b.pre) > 0;
}

interface RawRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

interface ManifestRelease {
  tag: string;
  name?: string | null;
  htmlUrl: string;
  publishedAt: string;
  tarballUrl: string;
  tarballSize: number;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new HTTPException(503, {
      message: `${name} is required to run self-update.`,
    });
  }
  return value;
}

function authHeaders(): Record<string, string> {
  const token = process.env.SELF_UPDATE_AUTH_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchRelease(path: string): Promise<RawRelease> {
  const repo = process.env.GITHUB_REPO?.trim() || DEFAULT_GITHUB_REPO;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "platform-self-update",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API}/repos/${repo}${path}`, { headers });
  if (res.status === 404) {
    throw new HTTPException(404, { message: "No matching release found." });
  }
  if (!res.ok) {
    throw new HTTPException(502, {
      message: `GitHub API responded ${res.status}`,
    });
  }
  return (await res.json()) as RawRelease;
}

function pickTarball(assets: RawRelease["assets"]): {
  url: string;
  size: number;
} {
  const asset =
    assets.find((a) => a.name === "platform-deploy-latest.tar.gz") ??
    assets.find((a) => /^platform-deploy-.*\.tar\.gz$/.test(a.name));
  if (!asset) {
    throw new HTTPException(502, {
      message: "Release has no deploy tarball asset.",
    });
  }
  return { url: asset.browser_download_url, size: asset.size };
}

function fromGithubRelease(data: RawRelease): UpdateRelease {
  const asset = pickTarball(data.assets);
  return {
    tag: data.tag_name,
    name: data.name,
    htmlUrl: data.html_url,
    publishedAt: data.published_at,
    tarballUrl: asset.url,
    tarballSize: asset.size,
  };
}

const githubUpdateSource: UpdateSourceProvider = {
  async getLatestRelease() {
    return fromGithubRelease(await fetchRelease("/releases/latest"));
  },
  async getReleaseByTag(tag: string) {
    return fromGithubRelease(
      await fetchRelease(`/releases/tags/${encodeURIComponent(tag)}`),
    );
  },
};

function normalizeManifestRelease(data: unknown): UpdateRelease {
  const release = data as Partial<ManifestRelease> | null;
  const tarballSize = release?.tarballSize;
  if (
    !release ||
    typeof release.tag !== "string" ||
    typeof release.htmlUrl !== "string" ||
    typeof release.publishedAt !== "string" ||
    typeof release.tarballUrl !== "string" ||
    typeof tarballSize !== "number" ||
    !Number.isFinite(tarballSize) ||
    tarballSize < 0
  ) {
    throw new HTTPException(502, {
      message: "Update manifest is missing required release fields.",
    });
  }
  return {
    tag: release.tag,
    name: typeof release.name === "string" ? release.name : null,
    htmlUrl: release.htmlUrl,
    publishedAt: release.publishedAt,
    tarballUrl: release.tarballUrl,
    tarballSize,
  };
}

async function fetchManifest(url: string): Promise<UpdateRelease> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "platform-self-update",
      ...authHeaders(),
    },
  });
  if (res.status === 404) {
    throw new HTTPException(404, { message: "No matching release found." });
  }
  if (!res.ok) {
    throw new HTTPException(502, {
      message: `Update manifest responded ${res.status}`,
    });
  }
  return normalizeManifestRelease(await res.json());
}

const manifestUpdateSource: UpdateSourceProvider = {
  async getLatestRelease() {
    return fetchManifest(requireEnv("SELF_UPDATE_MANIFEST_URL"));
  },
  async getReleaseByTag(tag: string) {
    const template = requireEnv("SELF_UPDATE_RELEASE_URL_TEMPLATE");
    if (!template.includes("{tag}")) {
      throw new HTTPException(503, {
        message: "SELF_UPDATE_RELEASE_URL_TEMPLATE must include {tag}.",
      });
    }
    return fetchManifest(template.replaceAll("{tag}", encodeURIComponent(tag)));
  },
};

function resolveUpdateSource(): UpdateSourceProvider {
  const source = process.env.SELF_UPDATE_SOURCE?.trim();
  switch (source) {
    case "github":
      return githubUpdateSource;
    case "manifest":
      return manifestUpdateSource;
    default:
      throw new HTTPException(503, {
        message:
          'SELF_UPDATE_SOURCE is required when self-update is enabled. Use "github" or "manifest".',
      });
  }
}

export async function getLatestRelease(): Promise<LatestRelease> {
  assertSelfUpdateEnabled();
  const data = await resolveUpdateSource().getLatestRelease();
  return {
    tag: data.tag,
    name: data.name,
    htmlUrl: data.htmlUrl,
    publishedAt: data.publishedAt,
    tarballUrl: data.tarballUrl,
    tarballSize: data.tarballSize,
    newer: isNewer(data.tag, APP_VERSION),
  };
}

async function getReleaseByTag(tag: string): Promise<{
  tag: string;
  tarballUrl: string;
}> {
  const data = await resolveUpdateSource().getReleaseByTag(tag);
  return { tag: data.tag, tarballUrl: data.tarballUrl };
}

function resolveRunner(): string {
  return join(/*turbopackIgnore: true*/ deployRoot(), "self-update.mjs");
}

export interface ApplyUpdateResult {
  jobId: string;
  targetTag: string;
  tarballUrl: string;
  mode: ApplyUpdateMode;
}

export async function applyUpdate(opts?: {
  tag?: string;
  mode?: ApplyUpdateMode;
}): Promise<ApplyUpdateResult> {
  assertSelfUpdateEnabled();

  // Acquire the run lock BEFORE any async work so two concurrent requests
  // can't both pass the check and spawn racing runners (the status-file
  // check alone is a TOCTOU window that spans the GitHub fetch below).
  acquireLock();

  let spawned = false;
  try {
    const mode = opts?.mode ?? "update";
    const target = opts?.tag
      ? await getReleaseByTag(opts.tag)
      : await resolveUpdateSource().getLatestRelease();
    const targetTag = target.tag;
    const tarballUrl = target.tarballUrl;

    // Block both redundant "latest" updates and explicit downgrades. Without
    // this on the no-tag path, an admin could trigger a full download → extract
    // → npm install → migrate → pm2 reload even when already on the latest.
    // Redeploy mode is intentionally allowed for the same version because its
    // destructive database reset is the point of that mode.
    if (mode === "update" && !isNewer(targetTag, APP_VERSION)) {
      throw new HTTPException(409, {
        message: `Target version ${targetTag} is not newer than the running version ${APP_VERSION}.`,
      });
    }

    const now = new Date().toISOString();

    writeUpdateStatus({
      phase: "running",
      step: "queued",
      message:
        mode === "redeploy"
          ? `Preparing redeploy to ${targetTag}`
          : `Preparing update to ${targetTag}`,
      targetTag,
      mode,
      progress: null,
      startedAt: now,
      updatedAt: now,
    });

    const child = spawn(
      process.execPath,
      [resolveRunner(), tarballUrl, targetTag, mode],
      {
        cwd: deployRoot(),
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          DEPLOY_ROOT: deployRoot(),
          UPDATE_STATE_FILE: stateFile(),
          UPDATE_LOCK_FILE: lockFile(),
        },
      },
    );
    spawned = true;

    // If the runner fails to start or exits before writing a terminal status,
    // transition out of "running" so subsequent update attempts are not blocked.
    child.on("error", (err) => {
      releaseLock();
      const prev = readUpdateStatus();
      if (prev.phase === "running") {
        writeUpdateStatus({
          ...prev,
          phase: "failed",
          step: "spawn",
          message: `Failed to start update runner: ${err.message}`,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    child.on("exit", (code) => {
      // The runner normally releases the lock in its own finally-block; only
      // intervene when it died before doing so (non-zero exit + still running).
      if (code !== 0 && readUpdateStatus().phase === "running") {
        releaseLock();
        const prev = readUpdateStatus();
        writeUpdateStatus({
          ...prev,
          phase: "failed",
          step: "spawn",
          message: `Update runner exited with code ${code} before reporting status.`,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    child.unref();

    return { jobId: randomUUID(), targetTag, tarballUrl, mode };
  } catch (err) {
    // Spawn succeeded → the runner owns the lock for the rest of its run.
    // Spawn failed (or earlier throw) → we still hold it, release here.
    if (!spawned) releaseLock();
    throw err;
  }
}
