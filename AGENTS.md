# Monorepo Instructions

## Workspace
- pnpm workspace: `apps/*` and `packages/*` from `pnpm-workspace.yaml`.
- `apps/admin`: Next.js 16.2.6 admin UI. Rules in `apps/admin/AGENTS.md`.
- `apps/organization`: Organization portal. Rules in `apps/organization/AGENTS.md`.
- `packages/service`: Hono API with Prisma 7, PostgreSQL. Rules in `packages/service/AGENTS.md`.
- `packages/shared`: shared permissions/types consumed by app and service.
- `manifest.json`: single source of truth for every app's port, basePath, and assetPrefix. Scripts (`gen-nginx.mjs`, `ecosystem.config.js`, `next.config.ts`, `assemble.sh`) all read from the manifest — there are no per-app `platform` fields in `package.json`.

## Commands
- Install/run with pnpm. Root `pnpm dev` runs only apps (`pnpm --filter './apps/*' dev`) with `NODE_OPTIONS='--max-old-space-size=8192'`; the service is consumed by Next under `/api`.
- Build apps: `pnpm build`.
- Lint/format: `pnpm lint` (`biome check .`), `pnpm lint:fix` (`biome check --write --unsafe .`), `pnpm format`.
- Prisma: `pnpm db:generate`, `pnpm db:push`, `pnpm db:migrate` (dev), `pnpm db:migrate:deploy` (prod), `pnpm db:seed`, `pnpm db:reset` all forward to `@repo/service`.

## Environment
- Bare `.env` files hold non-sensitive shared defaults and are committed by default; `.gitignore` ignores only secret variants like `.env.local` / `.env.production`. The one exception is `packages/service/.env`, which holds local dev secrets and is explicitly ignored.
- `createAppClient` defaults `API_ORIGIN` to `http://localhost:3000` (the manifest gateway port) when unset, so SSR and `next build` page-data collection work without a committed `.env`. Apps that need dev tokens (`SSR_API_TOKEN`, etc.) can keep a committed `.env` with just those values.
- `API_ORIGIN` in production is derived from the manifest's gateway port by `ecosystem.config.js`. Explicit values in `.env.production` (`API_ORIGIN` for a custom domain) override the manifest.
- Never put secrets in a committed `.env`; keep them in deployment env or a gitignored `.env.local` / `.env.production`.

## Tooling
- Biome is the linter/formatter, not ESLint. 2-space indentation, recommended Next/React domains.
- Zod 4 is installed. Prefer `z.email()` / `z.url()` over `z.string().email()`.
