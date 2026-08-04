# Monorepo Instructions

## Workspace
- pnpm workspace: `apps/*` and `packages/*` from `pnpm-workspace.yaml`.
- `apps/admin`: Next.js 16.2.6 admin UI. Rules in `apps/admin/AGENTS.md`.
- `apps/organization`: Organization portal. Rules in `apps/organization/AGENTS.md`.
- `packages/service`: Hono API with Prisma 7, PostgreSQL. Rules in `packages/service/AGENTS.md`.
- `packages/shared`: shared permissions/types consumed by app and service.

## Commands
- Install/run with pnpm. Root `pnpm dev` runs only apps (`pnpm --filter './apps/*' dev`) with `NODE_OPTIONS='--max-old-space-size=8192'`; the service is consumed by Next under `/api`.
- Build apps: `pnpm build`.
- Lint/format: `pnpm lint` (`biome check .`), `pnpm lint:fix` (`biome check --write --unsafe .`), `pnpm format`.
- Prisma: `pnpm db:generate`, `pnpm db:push`, `pnpm db:migrate` (dev), `pnpm db:migrate:deploy` (prod), `pnpm db:seed`, `pnpm db:reset` all forward to `@repo/service`.

## Environment
- `.env*` is gitignored by default (`.gitignore` line 54). Apps opt in to having their `.env` committed via `!apps/<app>/.env` negation rules right below it.
- This is intentional: committed `.env` files hold only non-sensitive shared defaults (e.g. `API_ORIGIN=http://localhost:3000`) so SSR and CI builds resolve server-side config. `createAppClient` throws at build time if `API_ORIGIN` is unset.
- When adding a new app under `apps/`, add a `!apps/<app>/.env` line to `.gitignore` AND commit its `.env` — otherwise CI page-data collection fails with "API_ORIGIN is required…". The local file exists for dev but is invisible to CI without the exception.
- Never put secrets in a committed `.env`; keep them in deployment env or an un-ignored (default-ignored) `.env.local` / `.env.production`.

## Tooling
- Biome is the linter/formatter, not ESLint. 2-space indentation, recommended Next/React domains.
- Zod 4 is installed. Prefer `z.email()` / `z.url()` over `z.string().email()`.
