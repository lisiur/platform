#!/usr/bin/env sh
# Assembles Next.js standalone deploy artifacts under $OUT and packs them into
# a deployable tarball next101-deploy-<sha>.tar.gz. Run after `pnpm build`.
# Used by .github/workflows/build.yml, but works standalone locally too.
set -eu

APPS="gateway admin organization"
# Default to the repo root (one level above this script) so `sh scripts/assemble.sh`
# works locally; CI overrides SRC_ROOT/OUT explicitly.
SRC_ROOT="${SRC_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
OUT="${OUT:-$SRC_ROOT/deploy}"

rm -rf "$OUT"
mkdir -p "$OUT"

for app in $APPS; do
  app_dir="$SRC_ROOT/apps/$app"
  standalone="$app_dir/.next/standalone"

  if [ ! -d "$standalone" ]; then
    echo "ERROR: standalone output missing for $app ($standalone)" >&2
    exit 1
  fi

  echo "==> Assembling $app"
  mkdir -p "$OUT/$app"
  cp -a "$standalone/." "$OUT/$app/"

  # Standalone omits static assets and public/ — copy them back in.
  rel="apps/$app"
  if [ -d "$app_dir/.next/static" ]; then
    mkdir -p "$OUT/$app/$rel/.next"
    cp -a "$app_dir/.next/static" "$OUT/$app/$rel/.next/static"
  fi
  if [ -d "$app_dir/public" ]; then
    cp -a "$app_dir/public" "$OUT/$app/$rel/public"
  fi
done

# Ship the PM2 config and the env template alongside the app bundles so the
# tarball is self-contained. The real .env.production (with secrets) is never
# baked in — it stays on the server; the deployer fills it from the template.
cp "$SRC_ROOT/ecosystem.config.js" "$OUT/"
if [ -f "$SRC_ROOT/.env.production.example" ]; then
  cp "$SRC_ROOT/.env.production.example" "$OUT/"
fi

# Ship the nginx reverse-proxy template alongside the bundles so the tarball
# is self-contained. The deployer merges its `location` blocks into their
# existing server { } — it is not a drop-in nginx.conf (see the header
# comments in scripts/nginx.conf).
cp -a "$SRC_ROOT/scripts/nginx.conf" "$OUT/nginx_template.conf"

# Ship Prisma schema + migrations + config so `npm run migrate` works on the
# server after `npm install`. The prisma CLI is a devDependency (pinned to
# match the generated client baked into each standalone server.js); the CLI
# itself is NOT traced into Next.js standalone output. Seeding is handled
# separately — the gateway self-seeds on boot from app.ts, gated by the seed
# fingerprint so it runs once per seed.ts revision.
mkdir -p "$OUT/prisma"
cp -a "$SRC_ROOT/packages/service/prisma/migrations" "$OUT/prisma/migrations"
cp -a "$SRC_ROOT/packages/service/prisma/schema.prisma" "$OUT/prisma/schema.prisma"
cp -a "$SRC_ROOT/packages/service/prisma/load-env.ts" "$OUT/prisma/load-env.ts"
cp -a "$SRC_ROOT/packages/service/prisma.config.ts" "$OUT/prisma.config.ts"

# Record the seed.ts source fingerprint. ecosystem.config.js reads this
# file at boot and injects it as SEED_FINGERPRINT into each app's env so the
# service self-seeds once per seed.ts revision.
node "$SRC_ROOT/scripts/seed-fingerprint.mjs" > "$OUT/seed.fingerprint"
echo "==> Seed fingerprint: $(cat "$OUT/seed.fingerprint")"

# Generate a minimal deploy package.json. The prisma/dotenv versions are read
# from the service package so they never drift from the generated client.
# `npm install` on the server fetches the matching prisma engines.
prisma_ver=$(node -p "require('$SRC_ROOT/packages/service/package.json').devDependencies.prisma")
dotenv_ver=$(node -p "require('$SRC_ROOT/packages/service/package.json').devDependencies.dotenv")
cat >"$OUT/package.json" <<EOF
{
  "name": "next101-deploy",
  "private": true,
  "scripts": {
    "migrate": "prisma migrate deploy",
    "start": "pm2 start ecosystem.config.js",
    "reload": "pm2 reload ecosystem.config.js"
  },
  "devDependencies": {
    "prisma": "${prisma_ver}",
    "dotenv": "${dotenv_ver}"
  }
}
EOF

echo "==> Artifact tree (depth 3):"
find "$OUT" -maxdepth 3 -type d | sort | head -80

# Pack the staged dir into a deployable tarball named by the git short SHA,
# written next to the deploy dir. Produces the same artifact locally that the
# GitHub Actions workflow ships.
sha=$(git -C "$SRC_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)
tarball="$SRC_ROOT/next101-deploy-${sha}.tar.gz"
tar -czf "$tarball" -C "$OUT" .
echo "==> Packed $tarball"
