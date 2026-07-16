# TODO

## High Priority

- [ ] **Job queue: no row-level claim / not multi-instance safe** — the scheduler re-queues
      every due `PENDING` job and there is no atomic "claim" when moving to `PROCESSING`
      (`lib/queues/job-worker.ts:22`). Multiple API instances will **duplicate-execute**.
      Add `SELECT … FOR UPDATE SKIP LOCKED` or a conditional `updateMany` on
      `status = 'PENDING'` before processing. See `ARCHITECTURE.md` §8.

## Medium Priority

- [ ] **Client loses RPC type safety** — manual `as` casts (`use-current-organization.ts:24`)
      instead of inferred types; use `withApiFeedback` consistently.
- [ ] **Job `retryJob` targets archived jobs** — `POST /api/jobs/:id/retry` looks up the live
      `Job` table (`services/job.service.ts:81`), but `FAILED` jobs are archived+deleted
      immediately (`lib/queues/job-worker.ts:78`), so manual retry 404s. Target `JobArchive`
      and re-create, or skip auto-archive for failed jobs.
- [ ] **Job archive is non-atomic** — `archiveAndDelete` does `jobArchive.create` then
      `job.delete` as two separate writes (`repositories/job.repository.ts:129`). A crash
      between them duplicates the row. Wrap both in `prisma.$transaction`.
- [ ] **Cache has no TTL** — the LRU is configured with `max` only (`lib/cache.ts:19`);
      entries never expire by time and live until evicted or manually cleared. Add a
      `ttl` option (and consider per-namespace TTLs) so stale data can't linger.
- [ ] **Cache invalidation is coarse (whole-namespace)** — channel/template mutations call
      `notificationChannelCache.clear()` / `notificationTemplateCache.clear()`, flushing
      *all* entries instead of the affected key (`services/notification/channel.service.ts:221`).
      Switch to targeted `delete(key)` to cut redundant DB refetches.

## Low Priority

- [ ] **`impersonatedBy`** field on Session (`schema.prisma:43`) appears unused —
      implement or remove.
- [ ] **Job `priority` is informational only** — stored and surfaced in the API but does not
      affect execution order (`p-queue` runs FIFO). Either wire priority into queue ordering
      or drop the field/docs claiming it.
- [ ] **Cache `getOrSet` is unused and not stampede-safe** — the cache-aside helper exists
      (`lib/cache.ts:73`) but has no callers; concurrent misses each fetch independently.
      Either adopt it (with in-flight promise de-dup) or remove it.
- [ ] **Cache `get<T>()` is an unchecked cast** — `set(key, unknown)` stores untyped and
      `get<T>()` blindly casts (`lib/cache.ts:40-48`). A wrong `T` at the read site compiles
      but returns garbage; keep read/write types aligned or add a typed wrapper.

## No Dues

- [ ] **No email verification** — `emailVerified` set false, never enforced; no verify
      endpoint in `routes/auth/`. Enforce ownership beyond uniqueness.

## Not Planned

- [ ] **Boot-time side effects** — `seed()` + `jobExecutor.start()` run at module boot
      (`src/app.ts:18-35`). Anti-pattern for serverless/standalone Next.js; risks cold-start
      races. Move to deploy/migration step.
- [ ] **Rate limit counters are in-memory / not multi-instance safe** — each instance counts
      independently, so behind a load balancer the effective per-subject limit is ~`N × max`
      (`lib/rate-limit-store.ts`). Same single-process constraint as Jobs/Cache; an external
      store (Redis) or shared Postgres counter is needed before scaling horizontally.
