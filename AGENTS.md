# Monorepo Instructions

## Workspace
- pnpm workspace: `apps/*` and `packages/*` from `pnpm-workspace.yaml`.
- `apps/admin`: Next.js 16.2.6 admin UI. Rules in `apps/admin/AGENTS.md`.
- `apps/organization`: Organization portal. Rules in `apps/organization/AGENTS.md`.
- `packages/service`: Hono API with Prisma 7, PostgreSQL. Rules in `packages/service/AGENTS.md`.
- `packages/shared`: shared permissions/types consumed by app and service.
- `manifest.json`: single source of truth for every app's port, basePath, and assetPrefix. Scripts (`gen-nginx.mjs`, `ecosystem.config.js`, `next.config.ts`, `assemble.sh`) all read from the manifest — there are no per-app `platform` fields in `package.json`. Optional per-app flags:
  - `"disabled": true` — build still runs, `pnpm dev` still works locally, but no nginx location block, no PM2 process, no tarball bundle, no updater PM2 ops, no gateway dev proxy. Use to keep the entry in the source manifest for documentation while shipping without it.
  - `"built": false` — stronger than `disabled`: skips the build entirely (see `scripts/build-apps.mjs`) and therefore every deploy artifact too. Implies `disabled`. Use to drop an app from CI entirely.
  - Same filter predicate everywhere: `!app.disabled && app.built !== false`.
  - Flipping an enabled app to `disabled` (without `built: false`) does NOT auto-stop a previously-running PM2 instance — `pm2 delete <name>` once after the change. Same for an app flipped to `built: false` post-launch: apps marked `built: false` from birth were never started, but the deploy-time filters only see the manifest, not PM2's live process list, so a previously-running instance survives every deploy until manually deleted.

## Commands
- Install/run with pnpm. Root `pnpm dev` runs only apps (`pnpm --filter './apps/*' dev`) with `NODE_OPTIONS='--max-old-space-size=8192'`; the service is consumed by Next under `/api`.
- Build apps: `pnpm build`.
- Lint/format: `pnpm lint` (`biome check .`), `pnpm lint:fix` (`biome check --write --unsafe .`), `pnpm format`.
- Prisma: `pnpm db:generate`, `pnpm db:push`, `pnpm db:migrate` (dev), `pnpm db:migrate:deploy` (prod), `pnpm db:reset` all forward to `@repo/service`. Seeding runs automatically on first service boot (`packages/service/src/app.ts`); `pnpm db:reset` + next boot re-seeds a fresh DB.

## Environment
- Bare `.env` files hold non-sensitive shared defaults and are committed by default; `.gitignore` ignores only secret variants like `.env.local` / `.env.production`. The one exception is `packages/service/.env`, which holds local dev secrets and is explicitly ignored.
- `createAppClient` defaults `API_ORIGIN` to `http://localhost:3000` (the manifest gateway port) when unset, so SSR and `next build` page-data collection work without a committed `.env`. Apps that need dev tokens (`SSR_API_TOKEN`, etc.) can keep a committed `.env` with just those values.
- `API_ORIGIN` in production is derived from the manifest's gateway port by `ecosystem.config.js`. Explicit values in `.env.production` (`API_ORIGIN` for a custom domain) override the manifest.
- Never put secrets in a committed `.env`; keep them in deployment env or a gitignored `.env.local` / `.env.production`.

## Forms
- Every form field backed by a schema (e.g. `zodResolver`) must render its validation error via `FieldError` (from `@repo/ui`) — validation that fails silently is a bug. Use `<FieldError errors={errors.x ? [errors.x] : undefined} />` and set `aria-invalid={!!errors.x}` on the input.
- When a component wraps `react-hook-form` (e.g. shared field components using `Controller`), read errors from `fieldState.error` / `form.getFieldState(name).error` so field-array and nested paths work.

## Tables
- Every `TableActionCell` (from `@repo/ui`) must pass a `menu` prop with `DropdownMenuItem`s mirroring the inline action buttons. Inline buttons only appear on desktop hover (`md:` + hover); without `menu`, mobile/touch users get an empty action column.
- Keep permission gating (`canUpdate`/`canDelete`) consistent between inline buttons and menu items; use `variant="destructive"` on destructive menu items.
- Extract row actions into named handlers (e.g. `openEdit(row)` defined at the component level) and reference them from both the inline button and the menu item — never duplicate the `onClick` body in both places. When actions are permission-gated, pass `menu={canX || canY ? (...) : undefined}` so users without any permitted action get no dropdown at all.

## Selects
- `Select`/`SelectValue` (from `@repo/ui`) wrap Base UI, not Radix. `SelectValue` renders the **raw value** (e.g. `"asset"`, an id) unless the Root receives an `items` mapping — a bare `<SelectValue />` inside a populated select is a bug.
- Always pass `items` to the `Select` root: `<Select items={options.map(o => ({ value: o.value, label: o.label }))} …>`, reusing the same labels as the `SelectItem` children (build the array once and map both from it). Alternatively, pass a function child to `SelectValue`: `<SelectValue>{(v) => labelFor(v)}</SelectValue>`.
- Base UI uses `onValueChange` (may deliver `null` when cleared) and accepts `null` for `value`; guard handlers accordingly.

## Tooling
- Biome is the linter/formatter, not ESLint. 2-space indentation, recommended Next/React domains.
- Zod 4 is installed. Prefer `z.email()` / `z.url()` over `z.string().email()`.
