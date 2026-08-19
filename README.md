# platform

> Last updated: 2026-08-18

A multi-tenant admin and organization platform built as a pnpm monorepo: a typed Hono REST API, four Next.js apps (an admin UI, an organization portal, a StudyBuddy portal, and a gateway entry point), and shared packages for UI, frontend utilities, permissions, and an OTA updater daemon.

`manifest.json` is the single source of truth for every app's port, basePath, and assetPrefix — scripts (`gen-nginx.mjs`, `ecosystem.config.js`, `next.config.ts`, `assemble.sh`) all read from it.

## Monorepo structure

```
apps/
  admin/         Next.js 16.2.6 admin UI (dev port 3001, basePath /admin)
  organization/  Next.js organization portal (dev port 3002, basePath /organization)
  studybuddy/    Next.js StudyBuddy portal (dev port 3003, basePath /studybuddy)
  gateway/       Next.js entry point: mounts the Hono API under /api and proxies the apps (dev port 3000)
packages/
  service/       Hono REST API with Prisma 7 + PostgreSQL
  frontend/      shared hooks/stores/utils (@repo/frontend)
  ui/            shared UI component library (@repo/ui)
  shared/        shared permissions/types (@repo/shared)
  updater/       standalone OTA self-update daemon (@repo/updater)
```

## Features

**Multi-tenancy & applications**

- Organization portal with departments, positions, and member management.
- Multi-app support: each application gets its own menus, roles, branding (logo, favicon, watermark, footer with copyright/ICP/PSIF), and permission scope.
- Watermark overlay with user name and email variable substitution, toggleable per application.
- Application registration and self-service organization onboarding.
- Organization-level settings (branding, logo) and a member dashboard.

**StudyBuddy portal**

- Org-scoped app with its own independent permission scope (`studybuddy::*`).
- Link collections with SSRF-safe link previews and automatic item enrichment.
- Collection export and import.
- Self-service credit usage page backed by a personal ledger endpoint.

**Authentication & authorization**

- Email/password sign-in and sign-up with argon2 hashing.
- Passkey (WebAuthn) registration and login, plus WeChat Mini Program login.
- Session-based auth with secure cookies (configurable session max age with presets); API tokens with required scopes for programmatic access.
- User banning with configurable ban reason and expiration.
- Granular RBAC with `group::action` permission codes, role assignment, and per-menu permission gating — scoped per app and organization.
- Position-based permission assignment: roles flow through positions, allowing departmental permission management.

**AI platform & agent**

- In-app AI chat assistant with tool-calling capability (call API endpoints, read files), interactive tool submissions, and streaming chat with session history and file upload.
- Per-application AI configuration (base URL, API key, model, reasoning) via app config or env vars; hybrid reasoning models supported.
- AI platform billing: providers, keys, and models (with AES-256-GCM-encrypted secrets), per-model pricing, usage events with a message-content audit trail, and a credit ledger with settlement and refund entries.
- Pricing plans with features, quotas, and subscriptions; redeem codes for crediting user balances.
- Permission-gated access (`system/agent:chat`) and an admin-controlled "allowed APIs" selector for which API operations the agent may invoke.

**Notifications**

- Multi-channel dispatch: in-app, SMTP email (Nodemailer), and SMS outbox.
- Templated messages with variable rendering, delivery records, retry with backoff, and a test-send workflow.
- Background dispatch via the job queue.

**Background jobs**

- Persistent job queue with a pluggable handler registry, scheduled execution (including recurring templates), concurrency control, atomic claiming of due instances, retry/backoff, and automatic archival of completed jobs.

**Rate limiting**

- Global and auth-specific (sign-in/sign-up) limiters with configurable windows and caps via env vars.
- Database-backed per-key overrides with an admin management UI, plus a live rate-limit status view.

**File upload & attachments**

- Signed URL access with HMAC signatures and expiry for secure file serving.
- SHA-256 hash-based deduplication with sharded storage paths.
- Hotlink protection with allowed domain whitelisting and MIME type validation (magic bytes).
- Polymorphic attachment associations (`bizType`/`bizId`) with public/private visibility.
- Admin file management UI with search, filtering, replace-in-place, and batch delete.

**System monitoring**

- Real-time resource dashboard showing CPU, memory (per-OS), storage, and process uptime.
- Auto-refreshing admin UI with progress indicators, gated by `system/system-info:view`.

**Observability & operations**

- Audit logs (with before/after diffs, trace IDs, severity levels) and operation logs (auto-logging every request with method, path, status, duration).
- System config with JSON-schema-driven admin UI; config keys centralized in registries with a write allowlist; runtime cache inspector/editor (LRU).
- In-app OTA self-update: downloads a release tarball (GitHub or manifest source, with optional proxy/token), extracts it safely over the deploy dir, runs migrations, and reloads PM2 — powered by the standalone `@repo/updater` daemon and surfaced through an in-app update dialog.

**Developer experience**

- Typed end-to-end RPC from frontends to the Hono API (no codegen step).
- Scalar OpenAPI docs at `/api/docs` with JSON at `/api/openapi.json`.
- Real-time push via Server-Sent Events (SSE) event bus.
- Internationalization (next-intl, English/Chinese), dark/light theming, and a shared UI library (Base UI + Tailwind v4 + TipTap rich text).

## Prerequisites

- Node.js (current LTS)
- pnpm
- PostgreSQL (set `DATABASE_URL`)

## Getting started

```bash
pnpm install
# configure .env — see Environment variables below
pnpm db:generate
pnpm db:push
pnpm dev
```

The database is seeded automatically on first service boot (`packages/service/src/app.ts`); set `SEED_ON_BOOT=false` to skip.

`CORS_ALLOWED_ORIGINS` controls which origins may call the API directly. The service is consumed by Next under `/api`, so it is not run standalone in dev.

## Development topology

In dev, `pnpm dev` starts all four apps. The gateway (port 3000) is the single entry point:

- `http://localhost:3000/admin` → proxied to the admin app (3001)
- `http://localhost:3000/organization` → proxied to the organization app (3002)
- `http://localhost:3000/studybuddy` → proxied to the StudyBuddy app (3003)
- `http://localhost:3000/api/...` → the Hono API, mounted via the gateway's catch-all route (`apps/gateway/src/app/api/[[...route]]/route.ts`)
- `http://localhost:3000/api/docs` → Scalar OpenAPI docs (JSON at `/api/openapi.json`)
- `http://localhost:3000/api/events` → SSE event stream (admin dashboard, rate-limit, job status updates)
- `http://localhost:3000/api/agent/...` → AI agent chat (streaming via AI SDK, file upload)

The gateway's dev rewrites (`apps/gateway/next.config.ts`) forward `/admin`, `/organization`, and `/studybuddy` — including their static asset prefixes — to the respective apps. In production these rewrites are disabled; each app is built with `output: "standalone"` and served behind a reverse proxy (nginx location blocks are generated by `scripts/gen-nginx.mjs` from the manifest).

All frontends call the API through typed Hono RPC (`appClient` from `@/lib/api`), targeting the gateway origin at `/api` with an `X-App-Code` header identifying the calling app. Per-app dev commands (`pnpm dev:admin`, `pnpm dev:studybuddy`, ...) start just one app plus the gateway.

## Environment variables

| Variable                            | Required | Description                                                                       |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | Yes      | PostgreSQL connection string used by Prisma.                                      |
| `SSR_API_TOKEN`                     | Prod     | Shared secret (`X-Internal-Token`) letting SSR calls bypass the rate limiter.      |
| `AGENT_API_TOKEN`                   | Prod     | Secret for the agent's `call_api` loopback requests (attributed to source `agent`). |
| `SECRET_ENCRYPTION_KEY`             | Prod     | AES-256-GCM key material for encrypting secrets (e.g. AI provider keys) at rest.  |
| `CORS_ALLOWED_ORIGINS`              | No       | Comma-separated allowed API origins. Unset = any origin in dev, none in prod.     |
| `NEXT_PUBLIC_API_ORIGIN`            | No       | Overrides the browser API origin (defaults to `http://localhost:3000` in dev).    |
| `DATA_DIR`                          | No       | Base path for on-disk data: `uploads/` and `agent-attachments/` live under it.    |
| `DATABASE_POOL_MAX`                 | No       | Max Prisma pool connections (default `10`).                                        |
| `DATABASE_STATEMENT_TIMEOUT_MS`     | No       | Server-side per-query timeout in ms (default `30000`).                            |
| `DATABASE_IDLE_TXN_TIMEOUT_MS`      | No       | Aborts idle-in-transaction sessions after this many ms (default `30000`).         |
| `DATABASE_CONNECT_TIMEOUT_MS`       | No       | Connection attempt timeout in ms (default `5000`).                                |
| `RATE_LIMIT_ENABLED`                | No       | Set to `false` to disable rate limiting (defaults to enabled).                    |
| `RATE_LIMIT_GLOBAL_MAX`             | No       | Max requests per global window (default `300`).                                   |
| `RATE_LIMIT_GLOBAL_WINDOW_MS`       | No       | Global limiter window length in ms (default `60000`).                             |
| `RATE_LIMIT_AUTH_MAX`               | No       | Max requests per auth-endpoint window (default `10`).                             |
| `RATE_LIMIT_AUTH_WINDOW_MS`         | No       | Auth limiter window length in ms (default `60000`).                               |
| `RATE_LIMIT_TRUST_PROXY`            | No       | Trusted proxy settings for client-IP resolution.                                 |
| `UPLOAD_SIGN_SECRET`                | No       | Secret used to sign upload access URLs.                                           |
| `WEBAUTHN_RP_ID`                    | No       | WebAuthn relying-party ID (defaults to `localhost`; overridable via system config). |
| `WEBAUTHN_ORIGIN`                   | No       | WebAuthn origin (defaults to `https://<rpID>`; overridable via system config).    |
| `CACHE_MAX_SIZE`                    | No       | Max entries in the runtime LRU cache (default `1000`).                            |
| `JOB_CONCURRENCY`                   | No       | Background job worker concurrency (default `5`).                                  |
| `SEED_ON_BOOT`                      | No       | Set to `false` to skip boot-time seeding of reference data.                       |
| `SELF_UPDATE_ENABLED`               | No       | Enables the in-app OTA update endpoint (off by default).                          |
| `SELF_UPDATE_SOURCE`                | No       | Update source: `github` or `manifest` (required when self-update is enabled).     |
| `SELF_UPDATE_GITHUB_REPO`           | No       | GitHub repo to check/download from (default `lisiur/platform`).                   |
| `SELF_UPDATE_GITHUB_TOKEN`          | No       | Optional token for private repos / higher GitHub API rate limits.                 |
| `SELF_UPDATE_GITHUB_PROXY`          | No       | Optional reverse proxy to accelerate GitHub asset downloads.                     |
| `SELF_UPDATE_MANIFEST_URL`          | No       | Manifest source: URL of the latest-release JSON.                                  |
| `SELF_UPDATE_RELEASE_URL_TEMPLATE`  | No       | Manifest source: tagged release URL template (`{tag}`).                           |
| `SELF_UPDATE_AUTH_TOKEN`            | No       | Optional bearer token for manifest endpoints.                                     |

System config groups (AI agent, WebAuthn, WeChat, auth, self-update) resolve DB-first with `${GROUP}_${KEY}` env fallbacks — see `.env.production.example`.

## Common scripts

| Command                    | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                 | Run all apps (the service is mounted under `/api`).                              |
| `pnpm dev:admin`           | Run the admin app + gateway only (likewise `dev:organization`, `dev:studybuddy`). |
| `pnpm build`               | Build the updater daemon and all apps.                                           |
| `pnpm build:server`        | Sequential, memory-capped app build for constrained environments.                |
| `pnpm clean:next`          | Remove all `.next` build directories.                                            |
| `pnpm lint`                | Lint with Biome (`biome check .`).                                               |
| `pnpm lint:fix`            | Auto-fix lint issues (`biome check --write --unsafe .`).                         |
| `pnpm format`              | Format with Biome.                                                               |
| `pnpm db:generate`         | Generate the Prisma client (forwards to `@repo/service`).                        |
| `pnpm db:push`             | Push the Prisma schema to the database.                                          |
| `pnpm db:migrate`          | Run Prisma migrations (dev; interactive).                                        |
| `pnpm db:migrate:deploy`   | Apply pending migrations in production (non-interactive).                         |
| `pnpm db:reset:danger`     | Reset the database (destructive).                                                |

## Architecture notes

Apps consume the Hono service via typed end-to-end RPC through the gateway's `/api` route (`AppType` is exported from the gateway route), with OpenAPI docs at `/api/docs` and JSON at `/api/openapi.json`. Access is RBAC-scoped through the shared permissions package. The service is organized into domain modules (`packages/service/src/modules/<domain>/`), each grouping routes (validation/permissions/audit), services (business logic), and repositories (Prisma data access) — see `packages/service/AGENTS.md`. Deployment metadata (ports, base paths, nginx, PM2) is centralized in `manifest.json`; OTA updates run through the `@repo/updater` daemon.

Tech stack: TypeScript, Next.js 16, React 19, Hono 4, Prisma 7, PostgreSQL, Zod 4, TanStack Query, TanStack Virtual, Tailwind v4, Base UI, TipTap, Biome 2, next-intl, Zustand, and Vitest.

## Conventions

See `AGENTS.md` (root and each app/package) for detailed conventions, workflow (GSD), and per-package rules.
