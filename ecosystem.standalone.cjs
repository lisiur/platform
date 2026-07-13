// PM2 config for the prebuilt STANDALONE artifacts.
//
// Unlike ecosystem.config.cjs (which runs `next start` from source built on
// the server), this runs the prebuilt standalone server bundles produced by
// the "build" GitHub Actions workflow (.github/workflows/build.yml).
// Server layout (from the tarball):
//   ./gateway/apps/gateway/server.js
//   ./admin/apps/admin/server.js
//   ./organization/apps/organization/server.js
//
//   pm2 start ecosystem.standalone.cjs
//   pm2 reload ecosystem.standalone.cjs   # zero-downtime after redeploy
//
//   Deploy / migrate flow (one-time, then per-release):
//     npm install                       # installs prisma + dotenv (engines)
//     npm run migrate && npm run reload # migrate fails → reload skipped
//
//   Seeding is automatic: the service self-seeds on boot from app.ts
//   (SEED_ON_BOOT=false to opt out).

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

const seedFpPath = "./seed.fingerprint";
const seedFingerprint = fs.existsSync(seedFpPath)
  ? fs.readFileSync(seedFpPath, "utf8").trim()
  : undefined;
if (seedFingerprint) {
  console.log(`[ecosystem] SEED_FINGERPRINT=${seedFingerprint.slice(0, 8)}…`);
}

const apps = [
  { name: "gateway", port: 3000 },
  { name: "admin", port: 3001 },
  { name: "organization", port: 3002 },
];

module.exports = {
  apps: apps.map(({ name, port }) => ({
    name,
    cwd: `./${name}`,
    script: `apps/${name}/server.js`,
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: String(port),
      ...(seedFingerprint ? { SEED_FINGERPRINT: seedFingerprint } : {}),
    },
  })),
};
