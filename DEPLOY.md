# Deployment (PM2 + nginx, own Linux server)

This app is a pnpm monorepo of three Next.js apps. In production each app runs
under PM2 on a localhost port, and nginx reverse-proxies one domain to them.

| App           | Port | Serves                                                |
| ------------- | ---- | ----------------------------------------------------- |
| `gateway`     | 3000 | `/api` (Hono service) + root page                     |
| `admin`       | 3001 | `/admin` (basePath), `/admin-static` (assetPrefix)    |
| `organization`| 3002 | `/organization`, `/organization-static`               |

> The Hono service is mounted inside the gateway at `/api` — there is no
> standalone service process to run.

## Requirements on the server

- Node.js (current LTS), pnpm
- PM2 (`npm i -g pm2`)
- nginx
- PostgreSQL (reachable via `DATABASE_URL`)

## First-time deploy

The "build" GitHub Actions workflow ([`.github/workflows/build.yml`](.github/workflows/build.yml),
triggered on `v*` tags) compiles the apps on a Linux runner and packs a
self-contained `platform-deploy-linux-<arch>.tar.gz` — standalone server bundles, static
assets, `ecosystem.config.js`, Prisma schema/migrations, and a minimal
`package.json`. It is attached to the GitHub release, so the server needs only
the Node runtime: **no git, pnpm, or build toolchain** on the host.

```bash
mkdir platform && cd platform

# Download the latest release tarball (linux/amd64). To pin a specific tag,
# replace `latest/download/...` with `download/<tag>/...`.
wget -O deploy.tar.gz \
  https://github.com/lisiur/platform/releases/latest/download/platform-deploy-linux-amd64.tar.gz
tar -xzf deploy.tar.gz && rm deploy.tar.gz

cp .env.production.example .env.production
vim .env.production                      # fill in DATABASE_URL, secrets, CORS

npm install                               # prisma CLI + dotenv (engines) only
npm run migrate                           # prisma migrate deploy

pm2 start ecosystem.config.js
pm2 save                                  # persist the process list
pm2 startup                               # follow the printed command to enable boot
```

The gateway self-seeds on boot: the service checks for the `admin` application
row and runs `seed` automatically when it's missing, so a fresh database needs
no manual `db:seed`.

Then point nginx at it (see below) and reload.

## Update an existing deploy

```bash
cd platform

# Download the latest release tarball.
wget -O deploy.tar.gz \
  https://github.com/lisiur/platform/releases/latest/download/platform-deploy-linux-amd64.tar.gz

# Extract over the current deploy dir — your .env.production is preserved
# (the tarball ships only .env.production.example).
tar -xzf deploy.tar.gz && rm deploy.tar.gz

npm install                               # prisma CLI + dotenv (engines) only
npm run migrate                           # only if there are new migrations

pm2 reload ecosystem.config.js            # zero-downtime restart
```

`pm2 reload` does a zero-downtime rolling restart. Use `pm2 restart` instead
only if a native module was recompiled.

## Redeploy from scratch (wipe database only)

Destructive: all database data is lost, but app files and `.env.production` are
kept in place. Use this when you want a clean database — schema drift that
`migrate deploy` can't resolve, corrupted state, etc. The gateway re-seeds
itself on boot, so a fresh admin login is recreated automatically.

```bash
cd platform

pm2 delete all                              # stop & remove running processes

# Download the latest release tarball and extract it over the current dir —
# .env.production is preserved (the tarball ships only the .example).
wget -O deploy.tar.gz \
  https://github.com/lisiur/platform/releases/latest/download/platform-deploy-linux-amd64.tar.gz
tar -xzf deploy.tar.gz && rm deploy.tar.gz

npm install                                 # prisma CLI + dotenv (engines)

npx prisma migrate reset --force            # drop all data, re-apply migrations

pm2 start ecosystem.config.js
pm2 save                                    # re-persist the process list
```

`pm2 startup` is NOT repeated — the boot hook installed during first-time setup
persists. Only `pm2 save` is needed to record the new process list.

For a non-destructive update (keep the data), follow "Update an existing deploy".

The admin app's Version dialog exposes both flows when `SELF_UPDATE_ENABLED=true`
and an explicit update source is configured: normal update runs the
non-destructive migrate/reload path, while "Redeploy from scratch" runs the
destructive reset/start path above.

Configure one source explicitly; there is no implicit default. All settings
can also be configured through the admin UI under **Settings → Self Update**.

```bash
# GitHub Releases source
SELF_UPDATE_ENABLED=true
SELF_UPDATE_SOURCE=github
SELF_UPDATE_GITHUB_REPO=lisiur/platform              # optional, defaults to lisiur/platform
SELF_UPDATE_GITHUB_TOKEN=                            # optional
DEPLOY_ROOT=/data/platform
```

```bash
# Provider-neutral manifest source
SELF_UPDATE_ENABLED=true
SELF_UPDATE_SOURCE=manifest
SELF_UPDATE_MANIFEST_URL=https://updates.example.com/platform/latest.json
SELF_UPDATE_RELEASE_URL_TEMPLATE=https://updates.example.com/platform/{tag}.json
SELF_UPDATE_AUTH_TOKEN=                  # optional bearer token
DEPLOY_ROOT=/data/platform
```

Manifest responses must contain the release metadata and deploy tarball URL:

```json
{
  "tag": "v1.3.0",
  "name": "v1.3.0",
  "htmlUrl": "https://updates.example.com/platform/v1.3.0",
  "publishedAt": "2026-08-05T00:00:00.000Z",
  "tarballUrl": "https://updates.example.com/platform/platform-deploy-linux-amd64.tar.gz",
  "tarballSize": 52428800
}
```

## nginx

The tarball ships `nginx_template.conf` (source: [`scripts/nginx.conf`](scripts/nginx.conf)).
Merge its `location` blocks into the existing `server { }` block that terminates
TLS for your domain, changing `server_name` to match. Then:

```bash
sudo nginx -t && sudo nginx -s reload
```

Routing summary (nginx longest-prefix match):

- `/admin*`, `/admin-static/*` -> admin :3001
- `/organization*`, `/organization-static/*` -> organization :3002
- everything else (`/api`, `/`) -> gateway :3000

## Environment variables

See [`.env.production.example`](.env.production.example) for the full list.
Required:

- `DATABASE_URL` — PostgreSQL connection string.
- `CORS_ALLOWED_ORIGINS` — allowed origins; the service **fails closed** (no
  cross-origin) in production when unset.
- `UPLOAD_SIGN_SECRET` — required for private file operations.

## Important notes

- **HTTPS is required.** The session cookie is `secure` in production, so it is
  only sent over HTTPS. Plain HTTP will break login.
- **One domain, path-based routing.** All apps + `/api` must share a single
  origin so the session cookie (`path: "/"`) is shared across admin and
  organization. Don't split them onto subdomains.
- **Firewall 3000–3002.** Block external access to the app ports (e.g.
  `ufw deny 3000:3002`) so only nginx can reach them.

## Useful PM2 commands

```bash
pm2 status                  # process status
pm2 logs                    # live logs (all apps)
pm2 logs admin              # one app
pm2 reload ecosystem.config.cjs   # zero-downtime restart after rebuild
pm2 stop all / pm2 delete all
```
