# Service Package Instructions

## Database and Codegen
- Prisma schema is `prisma/schema.prisma`; datasource is PostgreSQL and Prisma reads `DATABASE_URL` via `prisma.config.ts` / `src/lib/db.ts`.
- Generated Prisma client goes to `prisma/generated/prisma` and is intentionally ignored by Biome.
- After changing `schema.prisma`, run `pnpm db:generate` and restart any dev server; stale hot-reload state can leave `prisma.<model>` undefined at runtime.
- Import `prisma` from `#lib/db`; do not instantiate Prisma clients elsewhere.

## Hono API Patterns
- The Hono app has `basePath('/api')` in `src/app.ts`; Scalar docs are served at `/api/docs`, OpenAPI JSON at `/api/openapi.json`.
- Add resource routes under `src/routes/<resource>/` with `schema.ts`, one endpoint file per action, and an `index.ts` that exports the return value of `openapiRoutes([... ] as const)` for Hono RPC inference.
- Use `defineOpenAPIRoute` + `createRoute`; import `z` from `@hono/zod-openapi`, not `zod`, when defining OpenAPI schemas.
- In handlers, read validated inputs with `c.req.valid('param')`, `c.req.valid('query')`, or `c.req.valid('json')`; avoid `c.req.param()` / raw `c.req.json()`.
- Always pass an explicit status to `c.json(data, 200)` and define error responses with the shared `errorSchema` pattern.
- OpenAPI paths use `{id}` syntax, while Hono RPC client calls use bracket notation for dynamic parameters.

## Service Layer
- Routes should only handle: session extraction, permission checks, input validation, service calls, audit logging, and response formatting.
- Business logic, database operations, and validation rules belong in service files under `src/services/`.
- Services throw `HTTPException` for errors (404, 409, 400, etc.).

## Permissions
- Permission codes follow `group::action` format, e.g. `department::create`, `organization-member::list`.
- Platform permissions (admin app) are in `systemPermissions` array in `prisma/seed.ts`.
- Organization permissions (org app) are in `organizationPermissions` array in `prisma/seed.ts`.
- Use `assertPermission(userId, "permission::code", { appId, organizationId })` in route handlers to enforce permissions.
- Import `assertPermission` from `#services/role-permission.service`.
- For org-scoped permissions, pass `{ appId: "organization", organizationId }` as the scope.
- Platform permissions need no scope (defaults to PLATFORM).
- When adding new permissions, add them to the appropriate array in `seed.ts` and run `pnpm db:seed`.
- Role-permission mappings are in `adminRolePermissions` and `organizationRolePermissions` objects in `seed.ts`.
- `ORG_OWNER_ROLE_CODE` gets ALL `organizationPermissions` automatically via `.map()`.
- `ORG_MEMBER_ROLE_CODE` must be explicitly granted permissions (e.g. `["organization-member::list", "department::list"]`).

## Commands
- Standalone dev server: `pnpm dev` on `PORT` or `3001`.
- Tests: `pnpm exec vitest --run`; focus one file with `pnpm exec vitest --run src/routes/application/__tests__/application.test.ts`.
