# platform

A multi-tenant admin and organization platform built as a pnpm monorepo: a typed Hono REST API, three Next.js apps (an admin UI, an organization portal, and a gateway entry point), and shared packages for UI, frontend utilities, and permissions.

## Monorepo structure

```
apps/
  admin/         Next.js 16.2.6 admin UI (dev port 3001, basePath /admin)
  organization/  Next.js organization portal (dev port 3002, basePath /organization)
  gateway/       Next.js entry point: mounts the Hono API under /api and proxies the apps (dev port 3000)
packages/
  service/       Hono REST API with Prisma 7 + PostgreSQL
  frontend/      shared hooks/stores/utils (@repo/frontend)
  ui/            shared UI component library (@repo/ui)
  shared/        shared permissions/types (@repo/shared)
```

## Features

**Multi-tenancy & applications**

- Organization portal with departments, positions, and member management.
- Multi-app support: each application gets its own menus, roles, branding (logo, favicon, watermark, footer), and permission scope.
- Application registration and self-service organization onboarding.

**Authentication & authorization**

- Email/password sign-in and sign-up with argon2 hashing.
- Passkey (WebAuthn) registration and login, plus WeChat OAuth login.
- Session-based auth with secure cookies; API tokens for programmatic access.
- Granular RBAC with `group::action` permission codes, role assignment, and per-menu permission gating — scoped per app and organization.

**Notifications**

- Multi-channel dispatch: in-app, SMTP email (Nodemailer), and SMS outbox.
- Templated messages with variable rendering, delivery records, retry with backoff, and a test-send workflow.
- Background dispatch via the job queue.

**Background jobs**

- Persistent job queue with a pluggable handler registry, scheduled execution, concurrency control, retry/backoff, and automatic archival of completed jobs.

**Rate limiting**

- Global and auth-specific (sign-in/sign-up) limiters with configurable windows and caps via env vars.
- Database-backed per-key overrides with an admin management UI, plus a live rate-limit status view.

**Observability & operations**

- Audit logs and operation logs with full traceability and per-request trace IDs.
- System config with JSON-schema-driven admin UI; runtime cache inspector/editor (LRU).

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
pnpm db:seed
pnpm dev
```

`CORS_ALLOWED_ORIGINS` controls which origins may call the API directly. The service is consumed by Next under `/api`, so it is not run standalone in dev.

## Development topology

In dev, `pnpm dev` starts all three apps. The gateway (port 3000) is the single entry point:

- `http://localhost:3000/admin` → proxied to the admin app (3001)
- `http://localhost:3000/organization` → proxied to the organization app (3002)
- `http://localhost:3000/api/...` → the Hono API, mounted via the gateway's catch-all route (`apps/gateway/src/app/api/[[...route]]/route.ts`)
- `http://localhost:3000/api/docs` → Scalar OpenAPI docs (JSON at `/api/openapi.json`)

The gateway's dev rewrites (`apps/gateway/next.config.ts`) forward `/admin` and `/organization` — including their `/admin-static` and `/organization-static` assets — to the respective apps. In production these rewrites are disabled; each app is built with `output: "standalone"` and served behind a reverse proxy.

Both frontends call the API through typed Hono RPC (`appClient` from `@/lib/api`), targeting the gateway origin at `/api` with an `X-App-Code` header identifying the calling app.

## Environment variables

| Variable                       | Required | Description                                                                          |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                 | Yes      | PostgreSQL connection string used by Prisma.                                         |
| `CORS_ALLOWED_ORIGINS`         | No       | Comma-separated allowed API origins. Unset = any origin in dev, none in prod.        |
| `NEXT_PUBLIC_API_ORIGIN`       | No       | Overrides the browser API origin (defaults to `http://localhost:3000` in dev).       |
| `NEXT_PUBLIC_ADMIN_URL`        | No       | Gateway dev rewrite target for `/admin` (defaults to `http://localhost:3001`).      |
| `NEXT_PUBLIC_ORGANIZATION_URL` | No       | Gateway dev rewrite target for `/organization` (defaults to `http://localhost:3002`).|
| `RATE_LIMIT_ENABLED`           | No       | Set to `false` to disable rate limiting (defaults to enabled).                       |
| `RATE_LIMIT_GLOBAL_MAX`        | No       | Max requests per global window (default `300`).                                      |
| `RATE_LIMIT_GLOBAL_WINDOW_MS`  | No       | Global limiter window length in ms (default `60000`).                                |
| `RATE_LIMIT_AUTH_MAX`          | No       | Max requests per auth-endpoint window (default `10`).                                |
| `RATE_LIMIT_AUTH_WINDOW_MS`    | No       | Auth limiter window length in ms (default `60000`).                                  |
| `UPLOAD_SIGN_SECRET`           | No       | Secret used to sign upload access URLs.                                              |
| `WEBAUTHN_RP_ID`               | No       | WebAuthn relying-party ID (defaults to `localhost`; overridable via system config).  |
| `WEBAUTHN_ORIGIN`              | No       | WebAuthn origin (defaults to `https://<rpID>`; overridable via system config).       |
| `CACHE_MAX_SIZE`               | No       | Max entries in the runtime LRU cache (default `1000`).                               |
| `JOB_CONCURRENCY`              | No       | Background job worker concurrency (default `5`).                                     |

## Common scripts

| Command                    | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                 | Run all apps (the service is mounted under `/api`).        |
| `pnpm build`               | Build all apps.                                            |
| `pnpm build:server`        | Sequential, memory-capped app build for constrained environments. |
| `pnpm lint`                | Lint with Biome (`biome check .`).                        |
| `pnpm lint:fix`            | Auto-fix lint issues (`biome check --write --unsafe .`).   |
| `pnpm format`              | Format with Biome.                                        |
| `pnpm db:generate`         | Generate the Prisma client (forwards to `@repo/service`). |
| `pnpm db:push`             | Push the Prisma schema to the database.                   |
| `pnpm db:migrate`          | Run Prisma migrations (dev; interactive).                 |
| `pnpm db:migrate:deploy`   | Apply pending migrations in production (non-interactive).  |
| `pnpm db:seed`             | Seed the database.                                        |
| `pnpm db:reset:danger`     | Reset the database (destructive).                         |

## Architecture notes

Apps consume the Hono service via typed end-to-end RPC through the gateway's `/api` route (`AppType` is exported from the gateway route), with OpenAPI docs at `/api/docs` and JSON at `/api/openapi.json`. Access is RBAC-scoped through the shared permissions package. The service layer is split into routes (validation/permissions/audit), services (business logic), and repositories (Prisma data access) — see `packages/service/AGENTS.md`.

Tech stack: TypeScript, Next.js 16, React 19, Hono 4, Prisma 7, PostgreSQL, Zod 4, TanStack Query, TanStack Virtual, Tailwind v4, Base UI, TipTap, Biome 2, next-intl, Zustand, and Vitest.

## Conventions

See `AGENTS.md` (root and each app/package) for detailed conventions, workflow (GSD), and per-package rules.
