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

const envPath = "./.env.production";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] === undefined) {
      process.env[key] = (raw ?? "").replace(/^["']|["']$/g, "");
    }
  }
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
        ...process.env,
        NODE_ENV: "production",
        DEPLOY_ROOT: __dirname,
      },
    },
  ],
};
