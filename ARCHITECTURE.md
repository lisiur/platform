# Architecture: Job System

The platform ships an in-process background job queue built on top of Postgres
(for durability) and `p-queue` (for in-memory concurrency control). Work is
defined by **`Job` templates** (recurring via cron or manual trigger); templates
produce **`JobInstance`** rows that are picked up by an in-process
scheduler/worker. Instances keep their terminal status in place — there is no
separate archive table.

> All Job code lives under `packages/service/src/lib/queues/`. The job queue is
> **in-process** — there is no external broker (no Redis/BullMQ). It runs inside
> the same Node process that serves the Hono API (mounted in the `gateway` app).

---

## 1. Data Model

Defined in `packages/service/prisma/schema.prisma`.

```
enum JobStatus    { PENDING | PROCESSING | COMPLETED | FAILED }
enum JobPriority  { CRITICAL | HIGH | NORMAL | LOW | IDLE }
```

**`Job`** (`schema.prisma`, table `job`) — the *template*: defines a
group of jobs (recurring or manual-trigger). Templates are mutable.

| Field | Purpose |
|---|---|
| `id` | cuid |
| `name` | Unique human-friendly identifier (e.g. `"session-sweep"`) |
| `type` | Handler key, e.g. `"send-notification"` |
| `payload` | `Json?` — default payload copied into each produced instance |
| `cronExpression` | `String?` — 5-field cron. `NULL` = manual-trigger only |
| `enabled` | When `false`, the recurring schedule is paused |
| `priority` / `maxAttempts` / `timeoutMs` | Defaults inherited by instances |
| `lastRunAt` | When the last instance was dispatched |
| `nextRunAt` | Pre-computed next cron occurrence (via `croner`) |

**`JobInstance`** (table `job_instance`) — a single execution, produced either
by a template (`jobId` set) or ad-hoc by application code (`jobId = null`).

| Field | Purpose |
|---|---|
| `id` | cuid |
| `jobId` | `String?` — FK to the template; `null` for ad-hoc/event-driven jobs |
| `type` | Handler key (denormalized from template or set directly) |
| `payload` | `Json` — opaque data passed to the handler |
| `status` | Current lifecycle state |
| `priority` | Ordering hint (currently informational) |
| `attempts` / `maxAttempts` | Retry bookkeeping (default max 3) |
| `timeoutMs` | Per-instance execution timeout (default 60 000 ms) |
| `scheduledAt` | When the instance becomes eligible to run |
| `startedAt` / `completedAt` | Lifecycle timestamps |
| `result` / `error` | Handler return value / failure message |

On template deletion, `JobInstance.jobId` is set to `null` (`onDelete: SetNull`)
so execution history is preserved.

---

## 2. Core Components

```
                    ┌─────────────────────────────────────────────────────┐
                    │              JobExecutor (facade)                     │
                    │  start() · enqueue() · subscribe() · stats()          │
                    └──────────────┬─────────────────────────┬─────────────┘
         ┌────────────────────────┘                           │
         ▼                                                    ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐
   │JobScheduler │   │  JobQueue   │   │  JobWorker  │   │JobTemplateScheduler│
   │(instances)  │   │(p-queue, N) │   │(run+retry)  │   │  (cron dispatch)  │
   └─────────────┘   └─────────────┘   └─────────────┘   └──────────────────┘
```

### JobQueue — `lib/queues/job-queue.ts`
A thin wrapper around [`p-queue`](https://github.com/sindresorhus/p-queue) that
enforces concurrency. A single `JobProcessor` callback is registered by the
executor. Concurrency comes from `JOB_CONCURRENCY` (default `5`).

### JobScheduler — `lib/queues/job-scheduler.ts` (instance scheduler)
Decides *when* a `JobInstance` enters the in-memory queue.
- On `start()` it calls `loadExpiredJobs()`: pages through all `PENDING`
  instances (1000 at a time), enqueues any whose `scheduledAt <= now`, and arms
  a `setTimeout` for the next future-scheduled instance.
- Listens to the `job:created` and `job:rescheduled` context events to enqueue
  due instances immediately and to re-arm the timer.
- Long delays are capped at `MAX_TIMER_DURATION_MS` (24h) and re-evaluated on
  fire.

### JobTemplateScheduler — `lib/queues/job-template-scheduler.ts` (recurring engine)
Produces `JobInstance` rows from due templates — this is what makes recurring
jobs work.
- On `start()` it calls `dispatchDue()`: atomically claims due templates via
  `claimDueTemplates` (`SELECT ... FOR UPDATE SKIP LOCKED`), advancing each
  template's `lastRunAt`/`nextRunAt` within the same transaction, then creates a
  `JobInstance` for each claimed template (copying `type`/payload defaults) and
  emits `job:created` (→ the instance scheduler enqueues it). The schedule is
  advanced inside the claim so a transient error during instance creation cannot
  cause re-dispatch storms.
- **Skip-semantics:** `nextRunAt` is always computed from "now", so downtime gaps
  produce one catch-up run on recovery, not a backlog of missed runs.
- After dispatch it arms a `setTimeout` for the next due template (capped at 24h,
  same pattern as the instance scheduler). The executor's
  `rearmTemplateScheduler()` is called after template create/update/delete.

### JobWorker — `lib/queues/job-worker.ts`
Processes one instance. This is the heart of the execution model:
1. Mark `PROCESSING`, set `startedAt`, increment `attempts`.
2. Look up the handler by `job.type` in the registry (404-ish error if missing).
3. Run `handler(job)` racing against a `setTimeout(job.timeoutMs)` timeout.
4. **On success** → `COMPLETED` + store `result`.
5. **On failure**:
   - If `attempts >= maxAttempts` → `FAILED` + store `error`.
   - Otherwise → set back to `PENDING` with `scheduledAt = now + backoff`,
     where `backoff = min(5 000ms · 2^(attempts-1), 5min)` (exponential, capped).

There is **no archiving** — the instance row simply retains its terminal status.

### JobHandlerRegistry — `lib/queues/job-handler-registry.ts`
A `Record<type, JobHandler>` lookup. Handlers are registered at startup (see
§5). `JobHandler` is `(job: JobInstance) => Promise<unknown>` (`job.types.ts`).

### JobExecutorContext — `lib/queues/job-executor-context.ts`
A tiny typed event emitter for the five lifecycle events:
`job:created | job:processing | job:completed | job:failed | job:rescheduled`.

### JobExecutor — `lib/queues/job-executor.ts`
The facade that wires everything together. Public API:
- `start()` — boots both schedulers (instance recovery + template dispatch).
- `enqueue(job)` — emits `job:created` (instance scheduler decides if it runs now).
- `rearmTemplateScheduler()` — re-arms the template timer after template changes.
- `subscribe(fn)` — fan-out over all five lifecycle events.
- `getStats()` — live `queueSize`, `pending`, `concurrency` from `p-queue`.

---

## 3. Lifecycle of a Job Instance

```
  create  ──►  PENDING  ──(due)──►  PROCESSING  ──►  COMPLETED
                  │                      │
                  │                      │ fail
                  │                      ▼
                  └─ reschedule ◄── attempts < max
                    (backoff)        attempts ≥ max ──► FAILED
```

1. **Create** — a `JobInstance` row is inserted (`PENDING`, `attempts=0`). This
   happens either from a template (via `JobTemplateScheduler`) or ad-hoc.
2. **Schedule** — `jobExecutor.enqueue(job)` emits `job:created`. The scheduler
   enqueues it immediately if `scheduledAt <= now`, else arms a timer.
3. **Process** — `p-queue` calls `JobWorker.processJob` under concurrency.
4. **Retry** — failures before `maxAttempts` flip back to `PENDING` with an
   exponential backoff and a `job:rescheduled` event; the scheduler re-arms.
5. **Terminal** — `COMPLETED`/`FAILED` rows stay in the `job_instance` table
   (status + `completedAt`/`result`/`error` set). History is queried by status
   filter; no archive table exists.

Every lifecycle event is also broadcast to admin clients over SSE as a
`job.stats.updated` event (see §7).

---

## 4. Producing Jobs

There are two paths: **templates** (recurring / manual-trigger) and **ad-hoc
instances** (event-driven).

### A. Recurring templates (from service code or REST API)

Create a `Job` template via **`JobTemplateService`**
(`services/job-template.service.ts`):

```ts
import { jobTemplateService } from "#services/job-template.service";

const template = await jobTemplateService.createTemplate({
  name: "session-sweep",                 // unique
  type: "session-sweep",                 // handler key
  description: "Delete expired sessions",
  cronExpression: "0 * * * *",           // optional; omit for manual-trigger only
  enabled: true,
  priority: "NORMAL",
  maxAttempts: 3,
  timeoutMs: 60_000,
});
```

The service computes `nextRunAt` via `croner` and calls
`rearmTemplateScheduler()`. To run a template once without affecting the
schedule, use `jobTemplateService.triggerTemplate(id)`.

Templates are mutable (`updateTemplate`); changes to cron/enabled recompute
`nextRunAt` and take effect from the next scheduled run.

### B. Ad-hoc instances (event-driven, from service code)

For event-driven work (e.g. delivering notifications), create a `JobInstance`
directly via **`JobInstanceService`** (`services/job-instance.service.ts`) or
the repository inside a transaction:

```ts
import { jobInstanceRepository } from "#repositories/job-instance.repository";
import { jobExecutor } from "#states";

const job = await prisma.$transaction(async (tx) => {
  // ...create child rows in the same tx...
  return jobInstanceRepository.create(
    { type: "send-notification", payload, description }, tx,
  );
});
jobExecutor.enqueue(job); // notify the scheduler AFTER the tx commits
```

> Always `enqueue()` **after** the transaction commits, so the worker never sees
> a job whose payload rows aren't visible yet. The notification service
> (`notification.service.ts`) follows this pattern.

### C. Externally (REST API)

- `POST /api/jobs` — create a job **template**.
- `POST /api/jobs/:id/trigger` — run a template once immediately.
- `POST /api/job-instances` — create an ad-hoc **instance** (one-shot, no template).

---

## 5. Adding a New Job Handler

1. Create the handler in `states/job-executor/handlers/<name>.handler.ts`:

   ```ts
   import type { JobHandler } from "#lib/queues/job.types";

   export interface MyPayload { foo: string }

   export const myHandler: JobHandler = async (job) => {
     const payload = (job.payload ?? {}) as Partial<MyPayload>;
     if (!payload.foo) throw new Error("payload missing: foo");
     // ...do work, return a JSON-serialisable result...
     return { ok: true };
   };
   ```

2. Register it in `states/job-executor/handlers/index.ts`:

   ```ts
   registry.register("my-job-type", myHandler);
   ```

3. (For recurring work) Seed a `Job` template with the matching `type` and a
   `cronExpression` in `prisma/seed.ts` (`builtInJobTemplates`), or create one
   via the admin API/`JobTemplateService`.

The handler is keyed by the string passed as the instance's `type`. Throwing
rejects the instance (subject to retry/backoff); returning a value stores it as
`result`.

---

## 6. Built-in Handlers

Two handlers ship today (`handlers/index.ts`):

- **`send-notification`** — when notifications are created from a template
  (`createNotificationsFromTemplate`), a single `send-notification` instance
  carrying the `notificationIds` is created *in the same transaction* as the
  notification rows (`jobId = null`, ad-hoc). The handler calls
  `deliverNotifications`, dispatching per provider (`in-app`, `smtp-email`, …).
- **`session-sweep`** — deletes rows where `revokedAt IS NOT NULL` or
  `expiresAt < now()`. Seeded as a recurring template (`cron "0 * * * *"`,
  hourly) in `prisma/seed.ts` (`builtInJobTemplates`). Resolves issue #1.

---

## 7. Observability

- **SSE push**: `states/job-executor/index.ts` subscribes to the executor and
  publishes `job.stats.updated` (target `sse:admin:*:*`) on every lifecycle
  event. Admin clients receive it via `GET /api/events` (`routes/events/streamEvents.ts`).
- **Stats endpoint**: `GET /api/jobs/stats` returns live runtime numbers
  (`queueSize`, `pending`, `concurrency`) plus DB aggregates grouped by status
  and the next scheduled time.
- **Listing**: `GET /api/jobs` (templates) and `GET /api/job-instances`
  (instances, filterable by `status`/`type`/`jobId`), both paginated.
- **Control**: `DELETE /api/jobs/:id` (delete template), `PATCH /api/jobs/:id`
  (edit template), `DELETE /api/job-instances/:id` (cancel pending instance).

---

## 8. Configuration & Caveats

**Environment variables**
- `JOB_CONCURRENCY` — max in-flight instances for the `p-queue` (default `5`).
- Template/instance-level overrides: `maxAttempts` (3), `timeoutMs` (60 000),
  `priority` (NORMAL).

**Startup**: `jobExecutor.start()` is invoked at module load in `src/app.ts`.
On boot it runs both `loadExpiredJobs()` (recovers `PENDING` instances left
behind by a previous/crashed process) and `dispatchDue()` (dispatches due
templates).

**Important limitations to keep in mind:**

- **Single-process only.** The queue, both schedulers' timers, and lifecycle
  events live in memory. There is **no row-level lock / "claim"** step when
  moving an instance to `PROCESSING`, so running multiple API instances will
  cause **duplicate execution**. This design assumes a single long-lived process
  (e.g. one standalone Next.js server). Do not horizontally scale the API
  without first adding a claim/lease mechanism (e.g.
  `SELECT ... FOR UPDATE SKIP LOCKED` or an atomic `updateMany` conditional on
  `status = 'PENDING'`). Template *dispatch* is already claim-protected
  (`claimDueTemplates` uses `SKIP LOCKED`), so concurrent workers cannot create
  duplicate instances from the same due template — but the duplicate-execution
  risk remains at the instance-processing level.

- **Unbounded instance growth.** Terminal instances (`COMPLETED`/`FAILED`) are
  kept in place rather than archived. The table grows forever; there is no
  retention/pruning job yet. Query history via status filters. (See ISSUES.md
  #18 for the analogous retention concern.)

- **Priority is informational.** `priority` is stored and surfaced in the API but
  does not influence execution order — `p-queue` runs in FIFO insertion order.

- **Timer ceiling.** Delays beyond 24h are served by chained 24h timers; a
  process restart before the final fire re-covers them via `loadExpiredJobs()`
  / `dispatchDue()`.

---

# Architecture: Cache System

The platform has a lightweight **in-memory LRU cache** for hot, read-heavy
records (currently notification channels and templates). There is **no Redis**
— it is a process-local cache built on the [`lru-cache`](https://github.com/isaacs/node-lru-cache)
npm package, living inside the same Node process that serves the Hono API.

> All cache code lives under `packages/service/src/lib/cache.ts` (the primitive),
> `packages/service/src/states/cache.ts` (the shared singletons), and
> `packages/service/src/services/cache.service.ts` (the admin inspection layer).

---

## 1. The `Cache` primitive — `lib/cache.ts`

A small wrapper around `LRUCache<string, object>` with one notable feature:
**namespacing**.

```ts
static create(maxSize = 1000): Cache   // root cache, owns the LRU instance
namespace(ns: string): Cache           // returns a new view over the SAME LRU,
                                       //   with all keys prefixed "ns:"
```

A namespace is *not* a copy — it shares the underlying LRU instance with its
parent, so the `max` budget is global. `namespace()` composes: calling it on an
already-namespaced cache extends the prefix (`a:b:key`). Methods on a namespaced
view automatically prepend the prefix, and `clear()`/`keys()` are scoped to the
current namespace.

| Method | Behaviour |
|---|---|
| `get<T>(key)` | Returns cached value or `undefined` |
| `set(key, value)` | Stores a value (no TTL — see §5) |
| `delete(key)` | Removes one key |
| `clear(prefix?)` | Clears keys beginning with `prefix`; with no arg, clears the whole current namespace (or the entire LRU if unnamespaced) |
| `getOrSet<T>(key, fn)` | Cache-aside helper: `get`, on miss call `fn`, `set`, return |
| `keys()` / `size` | Keys (namespaced) / count |
| `has(key)` | Existence check |

---

## 2. The shared singletons — `states/cache.ts`

One root cache is created at startup and partitioned into named namespaces:

```ts
export const globalCache = Cache.create(CACHE_MAX_SIZE);            // env, default 1000
export const notificationChannelCache  = globalCache.namespace("notification:channel");
export const notificationTemplateCache = globalCache.namespace("notification:template");
```

Because they share `globalCache`'s LRU instance, the three exports compete for a
single `max` budget of `CACHE_MAX_SIZE` entries (default `1000`).

---

## 3. How data flows (cache-aside)

The system uses a **manual cache-aside** pattern in the notification services.
There is no automatic wiring; each consumer reads, misses, fetches, and stores:

**Read** (`getActiveNotificationChannel`, `channel.service.ts:226`):

```ts
const cached = notificationChannelCache.get<Channel>(id);
if (cached) return cached;            // hit

const channel = await prisma.notificationChannel.findFirst({ ... });
notificationChannelCache.set(id, channel);   // populate
return channel;
```

**Invalidation** (write-through, on every mutation): create/update/delete on a
channel or template calls `notificationChannelCache.clear()` /
`notificationTemplateCache.clear()`. Note these clear the **entire namespace**
(coarse-grained) rather than a single key — blunt but safe.

One subtlety in `findTemplateForDelivery` (`template.service.ts:255`): disabled
templates/channels are **never cached** (the entry is only `.set()` when there is
no `disabledReason`), so a later enable is always seen fresh.

---

## 4. The Admin Inspection API — `routes/cache/`

A full management surface (guarded by the `cache::manage` permission) lets
operators inspect and manipulate the live cache:

| Endpoint | Action |
|---|---|
| `GET /api/cache/stats` | Total keys, `maxSize`, per-namespace key counts |
| `GET /api/cache/keys?search=` | List keys (with substring search), split into namespace/key + value type |
| `GET /api/cache/entry?key=` | Read a single entry's value |
| `PUT /api/cache/entry` | Set/update an arbitrary entry (full key + value) |
| `DELETE /api/cache/entry?key=` | Delete one entry |
| `DELETE /api/cache/namespace` | Clear every key under a namespace |
| `DELETE /api/cache/all` | Wipe the whole cache (audited as `cache.all_cleared`) |

The `CacheService` (`services/cache.service.ts`) derives namespace/key by
splitting on the **last** `:` in the full key, so multi-segment namespaces like
`notification:channel:abc123` are reported as namespace `notification:channel`,
key `abc123`. The admin UI (`apps/admin/.../cache/components/cache-tree.tsx`)
renders these as a collapsible tree grouped by `:`-separated segments, with
refresh, search, and clear actions.

---

## 5. Configuration & Caveats

**Environment variables**
- `CACHE_MAX_SIZE` — global entry cap shared by all namespaces (default `1000`).

**Important limitations to keep in mind:**

- **In-memory / single-process.** The cache is not persisted and is not shared
  across processes. A restart empties it, and multiple API instances each hold
  an independent cache (no cross-instance coherence). This matches the Job
  queue's single-process assumption (see Job System §8).

- **No TTL.** The LRU is configured with `max` only — there is no time-based
  expiry. Entries are evicted purely by count (once `max` is exceeded) or by
  explicit invalidation. Stale data therefore lives until evicted or cleared.

- **Coarse invalidation.** Mutations `.clear()` the whole namespace rather than
  the affected key(s). This is safe but over-invalidates (every channel update
  flushes all channels).

- **`getOrSet` is unused.** The cache-aside helper on `Cache` exists but has no
  callers today; consumers do manual `get`/`set`. It is also not stampede-safe
  — concurrent misses each fetch independently (no in-flight promise de-dup).

- **Permissive `set`/`get` typing.** `set(key, unknown)` stores `unknown`, and
  `get<T>()` is an unchecked cast. A wrong `T` at the read site will compile but
  return garbage, so consumers must keep their read/write types aligned.

---

# Architecture: Rate Limit System

The platform rate-limits HTTP requests with a **fixed-window, in-process**
limiter. There is **no Redis** — counters live in memory inside the Hono API
process. The system layers a global limiter over a stricter auth limiter, and
adds per-subject overrides (whitelisting, custom ceilings) that admins can tune
at runtime through the API.

> All rate-limit code lives under `packages/service/src/lib/rate-limit-store.ts`
> (counter storage), `lib/rate-limit-registry.ts` (limiter + override registry),
> `middleware/rate-limit.ts` (Hono middleware), `services/rate-limit.service.ts`
> (admin/config layer), and `routes/rate-limit/` (management endpoints).

---

## 1. Core Components

```
  request ──► createRateLimiter (middleware)
                  │  1. resolve subject (user:<id> | ip:<addr>)
                  │  2. rateLimitRegistry.resolvePolicy(name, subject)
                  │  3. store.hit(subject, windowMs)
                  ▼
            RateLimitStore          ◄──── RateLimitRegistry (name → limiter)
            (Map subject→bucket)            • base max / windowMs
            • hit() · reset()              • SystemConfig defaults (runtime)
            • sweeper interval              • RateLimitOverride rows (per subject)
```

### RateLimitStore — `lib/rate-limit-store.ts`
A `Map<string, { count, resetAt }>` keyed by subject string. `hit(key, windowMs)`
is a **first-hit-anchored fixed window**: the first request in a lull sets
`resetAt = now + windowMs`; subsequent hits increment `count`; once `resetAt`
passes, the next hit starts a fresh window. A background sweeper
(`setInterval`, 60 s, `.unref()`'d) evicts expired buckets so the map doesn't
grow unbounded. Each limiter owns its **own** store instance.

### RateLimitRegistry — `lib/rate-limit-registry.ts`
A singleton holding the named limiters and two override sources. Its key method
is `resolvePolicy(name, subject)`, which composes a final policy in this order:

1. **Base** — the limiter's registered `max` / `windowMs` / `enabled`.
2. **SystemConfig defaults** — applied live via `updateDefaults(name, {...})`
   (called at boot from the `rate-limit` config group, see §3).
3. **Per-subject override** — a `RateLimitOverride` DB row for this exact subject
   (if present and within its `startAt`/`endAt` window). An override can supply a
   custom `max`/`windowMs` or set `bypass: true` to **whitelist** the subject.

It also exposes `snapshot()` for status inspection and `releaseKey()` /
`releaseSubject()` to manually clear a subject's bucket.

### createRateLimiter — `middleware/rate-limit.ts`
Hono middleware factory (`createRateLimiter({ name, max, windowMs, enabled })`).
On each request it:
1. Resolves the **subject**: `user:<id>` when a session cookie is present,
   otherwise `ip:<first x-forwarded-for | x-real-ip | "unknown">`.
2. Looks up the limiter entry by name; if disabled, calls `next()`.
3. `resolvePolicy` → `store.hit` → sets `X-RateLimit-Limit`, `-Remaining`,
   `-Reset` headers.
4. If `count > max`: returns **429** `{ code: 429, message: "Too Many Requests" }`
   with a `Retry-After` header, and (on the first over-limit hit) broadcasts a
   `rate_limit.updated` SSE event.

### rate-limit.service.ts
The admin/config layer. Loads overrides and defaults at boot, and exposes:
status snapshots, override CRUD, and a manual "release" (counter reset).

---

## 2. How Limiters Are Wired — `src/app.ts`

Two limiters are created and mounted in `app.ts:79-97`:

| Limiter | Mounted on | Default limit | Env defaults |
|---|---|---|---|
| `global` | `*` (every route) | 300 req / 60 s | `RATE_LIMIT_GLOBAL_MAX`, `RATE_LIMIT_GLOBAL_WINDOW_MS` |
| `auth` | `/auth/sign-in/email`, `/auth/sign-up/email`, `/auth/sign-in/wechat`, `/auth/change-password` | 10 req / 60 s | `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_AUTH_WINDOW_MS` |

Both are gated by the global `RATE_LIMIT_ENABLED` flag (default on). Because the
auth routes are also under `*`, a single auth request consumes a bucket in
**both** the `auth` store and the `global` store (they are independent stores).

---

## 3. Configuration Sources (3 layers)

Policy resolution merges three sources, checked innermost-wins:

1. **Env vars** — seed the limiter at construction (the table above).
2. **`SystemConfig` group `rate-limit`** — keys `enabled`, `global.max`,
   `global.windowMs`, `auth.max`, `auth.windowMs`. Loaded at boot by
   `initRateLimitDefaults()` (`app.ts:29`) and applied live via
   `rateLimitRegistry.updateDefaults()`. Editing these configs + calling
   `reloadRateLimitDefaults()` changes limits **without a restart**, and the
   store references are preserved (existing buckets survive).
3. **`RateLimitOverride` table** — per-subject rows (`ip:x.x.x.x` or
   `user:<id>`). Loaded into memory at boot by `initRateLimitOverrides()`
   (`app.ts:32`). Each row can set a custom `max`/`windowMs`, `bypass` (whitelist),
   a `note`, and an optional `startAt`/`endAt` **validity window** (e.g. a
   temporary lift during a demo). Rows mutated through the API are applied live
   via `setOverride`/`removeOverride`.

---

## 4. Admin Management API — `routes/rate-limit/`

All endpoints require the `rate-limit::manage` permission:

| Endpoint | Action |
|---|---|
| `GET /api/rate-limit/status?limiter=&blocked=` | Live bucket snapshot: subject, count, remaining, blocked, resetAt. Filterable to one limiter and/or blocked-only. |
| `GET /api/rate-limit/settings` | Configured limiters (name/max/windowMs). |
| `GET /api/rate-limit/overrides` | List all per-subject overrides. |
| `PUT /api/rate-limit/overrides/:subject` | Upsert an override (persisted to DB **and** applied live); broadcasts `rate_limit.updated`. |
| `DELETE /api/rate-limit/overrides/:subject` | Remove an override (persisted + live). |
| `POST /api/rate-limit/release` | Manually reset a subject's counter — scope to one `limiter` or all. **Audited** as `rate_limit.released`. |

---

## 5. Configuration & Caveats

**Environment variables**
- `RATE_LIMIT_ENABLED` — global kill switch (default on; set `false` to disable).
- `RATE_LIMIT_GLOBAL_MAX` / `RATE_LIMIT_GLOBAL_WINDOW_MS` — global limiter (300 / 60 000 ms).
- `RATE_LIMIT_AUTH_MAX` / `RATE_LIMIT_AUTH_WINDOW_MS` — auth limiter (10 / 60 000 ms).

**Important limitations to keep in mind:**

- **In-memory / single-process.** Counters are not shared across instances. Behind
  a load balancer with N API instances, the *effective* per-subject limit is
  roughly `N × max`, since each instance counts independently (a subject's
  requests are hashed/routed across instances). This mirrors the Job queue and
  Cache single-process assumptions.

- **Fixed-window boundary bursts.** The window is anchored to the first request,
  not to clock alignment. A burst of `max` requests just before `resetAt`,
  followed by another `max` immediately after, yields ~`2 × max` requests inside
  one `windowMs` span. This is acceptable for abuse prevention but not a hard
  guarantee.

- **`X-Forwarded-For` is trusted blindly.** The subject IP is taken as the first
  `x-forwarded-for` entry with no validation. If the API is reachable without a
  proxy that overwrites/normalises that header, a client can **spoof its IP** to
  evade limits. Ensure all ingress goes through a trusted proxy (or validate the
  header chain) before relying on IP-based limits.

- **SSE routing is target-based.** `EventBus` (`lib/event-bus.ts`) is a generic
  topic router: subscribers register `targets` (`:`-joined, single-segment `*`
  wildcard, symmetric), and `publish`/`close` match by `event.target`. Each SSE
  connection subscribes under `sse:<appCode>:<userId>:<token>`; publishers fan
  out with wildcards — `sse:admin:*:*` (admin dashboard, e.g. `rate_limit.updated`
  / `job.stats.updated`), `sse:<appCode>:<userId>:*` (an in-app notification),
  or `sse:*:<userId>:*` (an app-agnostic notification). `signOut` resolves the
  app via `requireCurrentApp` and calls `close("sse:<appCode>:<userId>:<token>")`.

- **Direct DB override writes need a restart.** Overrides loaded at boot are kept
  in sync only when mutated *through the API* (which calls `setOverride` live).
  A row added directly to `RateLimitOverride` won't take effect until restart.
