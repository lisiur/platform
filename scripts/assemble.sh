#!/usr/bin/env sh
# Assembles Next.js standalone deploy artifacts under $OUT and packs them into
# a deployable tarball platform-deploy-<os>-<arch>.tar.gz. Run after `pnpm build`.
# Used by .github/workflows/build.yml, but works standalone locally too.
set -eu

# Source of truth for the app list is the root manifest.json. Adding an app =
# adding it to manifest.json. There is no per-app platform field in package.json.
SRC_ROOT="${SRC_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# Default to the repo root (one level above this script) so `sh scripts/assemble.sh`
# works locally; CI overrides SRC_ROOT/OUT explicitly.
OUT="${OUT:-$SRC_ROOT/deploy}"

rm -rf "$OUT"
mkdir -p "$OUT"

# Get the app names for the copy loop below from the manifest.
APPS=$(node -e "console.log(require('$SRC_ROOT/manifest.json').apps.map(a=>a.name).join(' '))")

for app in $APPS; do
  app_dir="$SRC_ROOT/apps/$app"
  standalone="$app_dir/.next/standalone"

  if [ ! -d "$standalone" ]; then
    echo "ERROR: standalone output missing for $app ($standalone)" >&2
    exit 1
  fi

  echo "==> Assembling $app"
  mkdir -p "$OUT/apps/$app"
  cp -a "$standalone/." "$OUT/apps/$app/"

  # Standalone omits static assets and public/ — copy them back in.
  rel="apps/$app"
  if [ -d "$app_dir/.next/static" ]; then
    mkdir -p "$OUT/apps/$app/$rel/.next"
    cp -a "$app_dir/.next/static" "$OUT/apps/$app/$rel/.next/static"
  fi
  if [ -d "$app_dir/public" ]; then
    cp -a "$app_dir/public" "$OUT/apps/$app/$rel/public"
  fi
done

# Ship the PM2 config and the env template alongside the app bundles so the
# tarball is self-contained. The real .env.production (with secrets) is never
# baked in — it stays on the server; the deployer fills it from the template.
cp "$SRC_ROOT/scripts/ecosystem.config.js" "$OUT/"
cp "$SRC_ROOT/manifest.json" "$OUT/"
# Ship the standalone updater daemon (a single bundled file) plus its own PM2
# config. The daemon lives in a separate ecosystem file so it is never restarted
# by `pm2 reload/start ecosystem.config.js` (which targets only the apps).
# It must be built first: `pnpm --filter @repo/updater build`.
cp "$SRC_ROOT/packages/updater/dist/updater.mjs" "$OUT/updater.mjs"
cp "$SRC_ROOT/scripts/updater.config.js" "$OUT/"
if [ -f "$SRC_ROOT/.env.production.example" ]; then
  cp "$SRC_ROOT/.env.production.example" "$OUT/"
fi

# Ship the nginx reverse-proxy config alongside the bundles so the tarball is
# self-contained. The location blocks are GENERATED per app from manifest.json
# (via gen-nginx.mjs) into nginx/apps/*.conf; the
# `include <deploy-root>/nginx/apps/*.conf;` line to their TLS server block
# once (see nginx/server-block.example.conf). After that, every release is just
# extract + `nginx -s reload` — no manual merge.
node "$SRC_ROOT/scripts/gen-nginx.mjs" "$OUT/nginx/apps"
cp -a "$SRC_ROOT/scripts/nginx/server-block.example.conf" "$OUT/nginx/"

# Ship the deploy runbook so the operator has the first-time / update / wipe
# procedures, env-var reference, and nginx routing notes on the host.
cp -a "$SRC_ROOT/DEPLOY.md" "$OUT/DEPLOY.md"

# Ship Prisma schema + migrations + config so `npm run migrate` works on the
# server after `npm install`. The prisma CLI is pinned to match the generated
# client baked into each standalone server.js; the CLI itself is NOT traced
# into Next.js standalone output. Seeding is handled separately — the gateway
# self-seeds on boot from app.ts, gated by the presence of the admin
# Application row (one-shot bootstrap).
mkdir -p "$OUT/prisma"
cp -a "$SRC_ROOT/packages/service/prisma/migrations" "$OUT/prisma/migrations"
cp -a "$SRC_ROOT/packages/service/prisma/schema.prisma" "$OUT/prisma/schema.prisma"
cp -a "$SRC_ROOT/packages/service/prisma/load-env.ts" "$OUT/prisma/load-env.ts"
cp -a "$SRC_ROOT/packages/service/prisma.config.ts" "$OUT/prisma.config.ts"

# Generate a minimal deploy package.json. The prisma/dotenv versions are read
# from the service package so they never drift from the generated client.
# `npm install` on the server fetches the matching prisma engines. They are
# regular `dependencies` (not devDependencies) because the self-update runner
# inherits NODE_ENV=production, under which npm omits devDependencies.
prisma_ver=$(node -p "require('$SRC_ROOT/packages/service/package.json').devDependencies.prisma")
dotenv_ver=$(node -p "require('$SRC_ROOT/packages/service/package.json').devDependencies.dotenv")
cat >"$OUT/package.json" <<EOF
{
  "name": "platform-deploy",
  "private": true,
  "scripts": {
    "migrate": "prisma migrate deploy",
    "start": "pm2 start ecosystem.config.js",
    "reload": "pm2 restart ecosystem.config.js"
  },
  "dependencies": {
    "prisma": "${prisma_ver}",
    "dotenv": "${dotenv_ver}"
  }
}
EOF

echo "==> Artifact tree (depth 4):"
find "$OUT" -maxdepth 4 -type d | sort | head -80

# Pack the staged dir into a deployable tarball named by OS + arch. The release
# tag carries the version (in CI) — it is not encoded in the filename, so every
# release ships a canonical asset name per arch. Produces the same artifact
# locally that the GitHub Actions workflow ships.
arch_raw="$(uname -m)"
case "$arch_raw" in
  x86_64 | amd64) arch_default=amd64 ;;
  aarch64 | arm64) arch_default=arm64 ;;
  *) arch_default="$arch_raw" ;;
esac
os="${OS:-linux}"
arch="${ARCH:-$arch_default}"
tarball="$SRC_ROOT/platform-deploy-${os}-${arch}.tar.gz"
tar -czf "$tarball" -C "$OUT" .
echo "==> Packed $tarball"
