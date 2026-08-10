// Derives the app list from each app's OWN package.json ("platform" field),
// so adding an app = creating apps/<name>/ with a platform field. There is NO
// central registry to keep in sync.
//
// Shared by scripts/gen-nginx.mjs and scripts/assemble.sh. The deploy host has
// no source tree to rediscover from, so assemble.sh materializes this list into
// apps.json in the tarball, which scripts/ecosystem.config.js then reads.
//
// platform fields (in apps/<name>/package.json):
//   port        number   required — dev port
//   basePath    string   Next.js basePath (per-path apps; absent on the gateway)
//   assetPrefix string   Next.js assetPrefix (per-path apps; absent on the gateway)
//
// The gateway is identified by name ("gateway"): it is the catch-all host with
// no basePath/assetPrefix, handled specially by gen-nginx.mjs.
//
//   node scripts/read-apps.mjs              # print JSON array (default)
//   node scripts/read-apps.mjs json         # same, explicit
//   node scripts/read-apps.mjs names        # print space-separated names
//   node scripts/read-apps.mjs <out.json>   # write JSON to <out.json>, print names

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(here, "..");

export function readApps(root = defaultRoot) {
  const appsRoot = join(root, "apps");
  return readdirSync(appsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => {
      const pkg = JSON.parse(
        readFileSync(join(appsRoot, d.name, "package.json"), "utf8"),
      );
      const platform = pkg.platform ?? {};
      if (!platform.port) {
        throw new Error(
          `apps/${d.name}/package.json is missing a "platform.port" field.`,
        );
      }
      return { name: d.name, ...platform };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// CLI mode: emit the list in a form other tools/shells can consume.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? "json";
  const apps = readApps();
  if (mode === "names") {
    console.log(apps.map((a) => a.name).join(" "));
  } else if (mode === "json") {
    console.log(JSON.stringify(apps, null, 2));
  } else {
    // Bare path: write the JSON there (for the tarball) and print the names —
    // lets assemble.sh produce both the materialized file and the app list in a
    // single pass instead of invoking this loader twice.
    writeFileSync(mode, `${JSON.stringify(apps, null, 2)}\n`);
    console.log(apps.map((a) => a.name).join(" "));
  }
}
