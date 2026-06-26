# Monorepo Instructions

## Workspace
- pnpm workspace: `apps/*` and `packages/*` from `pnpm-workspace.yaml`.
- `apps/admin`: Next.js 16.2.6 admin UI. Extra rules live in `apps/admin/AGENTS.md`; read them before editing UI files.
- `packages/service`: Hono API with `@hono/zod-openapi`, Prisma 7, PostgreSQL. Exported from `src/index.ts` and mounted into Next at `apps/admin/src/app/api/[[...route]]/route.ts` through `hono/vercel`.
- `packages/shared`: shared permissions/types consumed by app and service.

## Commands
- Install/run with pnpm. Root `pnpm dev` runs only apps (`pnpm --filter './apps/*' dev`) with `NODE_OPTIONS='--max-old-space-size=8192'`; the service is consumed by Next under `/api`.
- Standalone API dev server: `pnpm --filter @repo/service dev` on `PORT` or `3001`.
- Build apps: `pnpm build`.
- Lint/format: `pnpm lint` (`biome check .`), `pnpm lint:fix` (`biome check --write --unsafe .`), `pnpm format`.
- Prisma: `pnpm db:generate`, `pnpm db:push`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset` all forward to `@repo/service`.
- Tests are not wired at the root. Service tests use Vitest: `pnpm --filter @repo/service exec vitest --run`; focus one file with `pnpm --filter @repo/service exec vitest --run src/routes/application/__tests__/application.test.ts`.

## Database and Codegen
- Prisma schema is `packages/service/prisma/schema.prisma`; datasource is PostgreSQL and Prisma reads `DATABASE_URL` via `packages/service/prisma.config.ts` / `src/lib/db.ts`.
- Generated Prisma client goes to `packages/service/prisma/generated/prisma` and is intentionally ignored by Biome.
- After changing `schema.prisma`, run `pnpm db:generate` and restart any dev server; stale hot-reload state can leave `prisma.<model>` undefined at runtime.
- Import `prisma` from `@repo/service` or `packages/service/src/lib/db.ts`; do not instantiate Prisma clients elsewhere.

## Hono API Patterns
- The Hono app has `basePath('/api')` in `packages/service/src/app.ts`; Scalar docs are served at `/api/docs`, OpenAPI JSON at `/api/openapi.json`.
- Add resource routes under `packages/service/src/routes/<resource>/` with `schema.ts`, one endpoint file per action, and an `index.ts` that exports the return value of `openapiRoutes([... ] as const)` for Hono RPC inference.
- Use `defineOpenAPIRoute` + `createRoute`; import `z` from `@hono/zod-openapi`, not `zod`, when defining OpenAPI schemas.
- In handlers, read validated inputs with `c.req.valid('param')`, `c.req.valid('query')`, or `c.req.valid('json')`; avoid `c.req.param()` / raw `c.req.json()`.
- Always pass an explicit status to `c.json(data, 200)` and define error responses with the shared `errorSchema` pattern.
- OpenAPI paths use `{id}` syntax, while Hono RPC client calls use bracket notation for dynamic parameters.
- **Service Layer**: Routes should only handle session extraction, permission checks, input validation, service calls, audit logging, and response formatting. Business logic, database operations, and validation rules belong in service files under `packages/service/src/services/`. Services throw `HTTPException` for errors.

## Frontend API Use
- Use `appClient` from `@/lib/api`; never raw `fetch` for app API calls.
- `apps/admin/src/lib/api/app-client.ts` currently uses `hc<AppType>('', { headers: { 'X-App-Code': 'admin' } })`; keep the app-code header unless the backend contract changes.
- Dynamic RPC segments use bracket notation such as `appClient.api.organizations[':id'].$put({ param: { id }, json })`; request bodies use `json`, not `body`, and check `res.ok` before `res.json()`.

## Frontend Conventions
- `apps/admin/AGENTS.md` requires Next 16 docs under `node_modules/next/dist/docs/` for uncertain Next APIs, `next/image` instead of `<img>`, Field primitives from `@repo/ui` inside forms, and sticky-right action columns in tables.
- Overlay choice is task-scoped: `Dialog` for focused create/edit/delete/confirm forms, `Sheet` for contextual relationship/config workflows tied to a selected record, full page for primary dense or bookmarkable management surfaces.

## Tooling Quirks
- Biome is the linter/formatter, not ESLint. It uses 2-space indentation, recommended Next/React domains, and organizes imports.
- The admin app uses the `@/*` alias for `apps/admin/src/*`; service package imports also define `#lib/*`, `#middleware/*`, `#repositories/*`, and `#routes/*` in `packages/service/package.json`.
- Zod 4 is installed. Prefer standalone string format validators like `z.email()` / `z.url()` over deprecated `z.string().email()` / `z.string().url()`.

## Workflow
- Before repo edits, start through the GSD workflow unless the user explicitly bypasses it: `/gsd-quick` for small tasks, `/gsd-debug` for bugs, `/gsd-execute-phase` for planned phase work.
