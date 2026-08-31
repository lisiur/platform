#!/usr/bin/env node
// Builds every app in manifest.json whose `built` flag is not `false`.
// The `disabled` flag is intentionally NOT consulted here — per
// AGENTS.md, `disabled:true` should still build so `pnpm dev` keeps
// working locally and CI artifacts exist if the flag is flipped back.
// The deploy-time consumers (gen-nginx.mjs, ecosystem.config.js,
// assemble.sh, gateway dev rewrites, updater/pm2.ts) apply the broader
// filter `!disabled && built !== false` to skip disabled apps from
// nginx, PM2, tarball, updater PM2 ops, and the gateway dev proxy:
//
//   built: false  → skip build, skip nginx, skip PM2, skip tarball, skip
//                   updater PM2 ops, skip gateway dev proxy. Implies disabled.
//   disabled:true  → still build, but skip nginx, skip PM2, skip tarball,
//                   skip updater PM2 ops, skip gateway dev proxy.
//   (no flag)     → fully enabled.
//
// Adding an app = adding it to manifest.json. There is no per-app
// `platform` field in package.json. The updater package build is handled
// separately by the root `build` script (see package.json) because the
// updater is not an app and is never listed in manifest.json.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

const shouldBuild = (a) => a.built !== false;
const enabled = manifest.apps.filter(shouldBuild);
const skipped = manifest.apps.filter((a) => !shouldBuild(a));

if (skipped.length > 0) {
  console.log(
    `==> Skipping ${skipped.length} app(s): ${skipped
      .map((a) => `${a.name} (built:false)`)
      .join(", ")}`,
  );
}

const buildOne = (app) =>
  new Promise((resolve) => {
    console.log(`==> Building ${app.name}`);
    const child = spawn("pnpm", ["--filter", `./apps/${app.name}`, "build"], {
      stdio: "inherit",
      cwd: root,
    });
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.on("error", (err) =>
      settle({
        app: app.name,
        ok: false,
        message: `spawn failed: ${err.message}`,
      }),
    );
    child.on("exit", (code, signal) => {
      if (code === 0) {
        settle({ app: app.name, ok: true });
      } else {
        settle({
          app: app.name,
          ok: false,
          message: signal ? `killed by ${signal}` : `exit ${code}`,
        });
      }
    });
  });

const results = await Promise.all(enabled.map(buildOne));
const failed = results.filter((r) => !r.ok);

if (failed.length > 0) {
  for (const f of failed) {
    console.error(`==> ${f.app} build failed: ${f.message}`);
  }
  process.exit(1);
}

console.log(
  `==> Built ${enabled.length} app(s)${skipped.length ? ` (skipped ${skipped.length})` : ""}`,
);
