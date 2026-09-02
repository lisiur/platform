// PM2 config for the standalone updater daemon.
//
// Lives in a SEPARATE file from ecosystem.config.js on purpose: the daemon must
// not be restarted by `pm2 reload/start ecosystem.config.js` (which targets
// only the three apps), because that would kill the very process running the
// update. Same PM2 god, same `pm2 startup` / `pm2 save` boot persistence.
//
//   pm2 start updater.config.js
//
// The daemon serves a Unix-socket HTTP API (updater.sock) that the service
// forwards update / cancel / status requests to. It is pure Node (shipped as a
// single bundled updater.mjs) and never touches the database — the service
// resolves the release tarball URL and hands it to the daemon.

const fs = require("node:fs");
const path = require("node:path");

// Load .env.production into a clean object rather than process.env. See
// ecosystem.config.js for why spreading process.env is unsafe inside a
// PM2-managed process (PM2 internals like pm_exec_path leak through).
const appEnv = {};
const envPath = path.join(__dirname, ".env.production");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    // Operator overrides win: a value already in the real environment
    // (e.g. `pm2 restart --update-env`, or systemd) takes precedence over
    // .env.production. Only keys present in .env.production are considered, so
    // PM2 internals (name, pm_exec_path, …) never leak in.
    // dotenv-style value parsing: a matched pair of surrounding quotes is
    // stripped (an optional inline comment may follow); an unquoted value
    // ends at a `#` that starts the line or follows whitespace, so `#` inside
    // quoted values — and in unquoted URLs like host/path#frag — survives.
    const trimmed = (raw ?? "").trim();
    const quoted = trimmed.match(/^(['"])(.*?)\1(\s+#.*)?$/);
    const fileValue = quoted
      ? quoted[2]
      : trimmed.replace(/(^|\s)#.*$/, "").trim();
    appEnv[key] = process.env[key] !== undefined ? process.env[key] : fileValue;
  }
}

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

module.exports = {
  apps: [
    {
      name: "updater",
      cwd: __dirname,
      script: "updater.mjs",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        ...systemEnv,
        ...appEnv,
        NODE_ENV: "production",
        DEPLOY_ROOT: __dirname,
      },
    },
  ],
};
