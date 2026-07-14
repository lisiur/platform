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
self-contained `next101-deploy-<sha>.tar.gz` — standalone server bundles, static
assets, `ecosystem.config.js`, Prisma schema/migrations, and a minimal
`package.json`. It is attached to the GitHub release, so the server needs only
the Node runtime: **no git, pnpm, or build toolchain** on the host.

```bash
mkdir next101 && cd next101

# Download the tarball from the GitHub release for the tag you're deploying.
wget -O deploy.tar.gz \
  https://github.com/<org>/<repo>/releases/download/v1.0.0/next101-deploy-<sha>.tar.gz
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
cd next101

# Download the tarball for the new release tag.
wget -O deploy.tar.gz \
  https://github.com/<org>/<repo>/releases/download/v1.1.0/next101-deploy-<sha>.tar.gz

# Extract over the current deploy dir — your .env.production is preserved
# (the tarball ships only .env.production.example).
tar -xzf deploy.tar.gz && rm deploy.tar.gz

npm install                               # prisma CLI + dotenv (engines) only
npm run migrate                           # only if there are new migrations

pm2 reload ecosystem.config.js            # zero-downtime restart
```

`pm2 reload` does a zero-downtime rolling restart. Use `pm2 restart` instead
only if a native module was recompiled.

## nginx

Merge the `location` blocks from [`scripts/nginx.conf`](scripts/nginx.conf) into
the existing `server { }` block that terminates TLS for your domain, changing
`server_name` to match. Then:

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
