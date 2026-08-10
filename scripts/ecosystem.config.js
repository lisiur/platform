// PM2 config for the prebuilt STANDALONE artifacts.
//
// Unlike ecosystem.config.cjs (which runs `next start` from source built on
// the server), this runs the prebuilt standalone server bundles produced by
// the "build" GitHub Actions workflow (.github/workflows/build.yml).
// Server layout (from the tarball), one entry per app in scripts/apps.json:
//   ./apps/<name>/apps/<name>/server.js
// Currently: gateway, admin, organization, studybuddy.
//
//   pm2 start ecosystem.config.js
//   pm2 restart ecosystem.config.js  # pick up newly extracted code
//
//   Deploy / migrate flow (one-time, then per-release):
//     npm install                       # installs prisma + dotenv (engines)
//     npm run migrate && npm run reload # migrate fails → reload skipped

const fs = require("node:fs");
const path = require("node:path");

// Build the environment for the app processes from .env.production plus a
// curated set of system variables. We deliberately do NOT spread process.env
// wholesale: when this file is loaded by `pm2 start` from inside the updater
// daemon (itself a PM2-managed process), process.env contains PM2-internal
// variables — most critically `name` and `pm_exec_path` pointing at
// updater.mjs. Spreading those into each app's env makes PM2 inherit the
// updater's script and name, so every app launches updater.mjs instead of its
// own server.js (the "three updaters, EADDRINUSE on updater.sock" failure).
const appEnv = {};
const envPath = path.join(__dirname, ".env.production");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    // Operator overrides win: a value already in the real environment
    // (e.g. `pm2 restart --update-env`, or systemd) takes precedence over the
    // tarball's .env.production — e.g. rotating DATABASE_URL without
    // rebuilding the tarball. Only keys present in .env.production are
    // considered, so PM2 internals (name, pm_exec_path, …) never leak in.
    const fileValue = (raw ?? "").replace(/^["']|["']$/g, "");
    appEnv[key] = process.env[key] !== undefined ? process.env[key] : fileValue;
  }
}

// System vars the standalone servers need (binary resolution, locale, npm
// config, …). Passed through individually to avoid pulling in PM2 internals.
const SYS_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "TERM",
  "NODE_OPTIONS",
];
const systemEnv = {};
for (const key of SYS_ENV_KEYS) {
  if (process.env[key] !== undefined) systemEnv[key] = process.env[key];
}

// Source of truth for the app list: scripts/apps.json (shared with
// scripts/assemble.sh and scripts/gen-nginx.mjs, so PM2, the tarball, and
// nginx never drift apart when an app is added). In the tarball this file and
// apps.json ship side-by-side at the deploy root, so the relative require
// resolves in both the repo and post-extract.
const apps = require("./apps.json");

// The updater daemon's Unix socket lives at the deploy root (next to this
// file). Resolve it from __dirname so the gateway (which hosts the service)
// can always find the daemon without the operator setting DEPLOY_ROOT.
const UPDATER_SOCKET = path.join(__dirname, "updater.sock");

module.exports = {
  apps: apps.map(({ name, port }) => ({
    name,
    cwd: path.join(__dirname, "apps", name),
    // Absolute path on purpose: PM2 resolves a relative `script` against the
    // ecosystem file's directory (the deploy root), NOT against `cwd`, so a
    // relative `apps/<name>/server.js` would resolve to
    // `<root>/apps/<name>/server.js` (missing) instead of the real
    // `<root>/apps/<name>/apps/<name>/server.js`. updater.config.js dodges this
    // only because its cwd and script share a base; pinning the full path here
    // is unambiguous and makes `pm2 start ecosystem.config.js` reliable.
    script: path.join(__dirname, "apps", name, "apps", name, "server.js"),
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_memory_restart: "1G",
    env: {
      ...systemEnv,
      ...appEnv,
      NODE_ENV: "production",
      PORT: String(port),
      UPDATER_SOCKET,
    },
  })),
};
