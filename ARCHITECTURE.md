# Architecture: Job System

The platform ships an in-process background job queue built on top of Postgres
(for durability) and `p-queue` (for in-memory concurrency control). Jobs are
created by application code or via the REST API, persisted as rows, picked up by
an in-process scheduler/worker, and archived once they reach a terminal state.

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

**`Job`** (`schema.prisma:101`) — the live/active job table:

| Field | Purpose |
|---|---|
| `id` | cuid |
| `type` | Handler key, e.g. `"send-notification"` |
| `payload` | `Json` — opaque data passed to the handler |
| `status` | Current lifecycle state |
| `priority` | Ordering hint (currently informational) |
| `attempts` / `maxAttempts` | Retry bookkeeping (default max 3) |
| `timeoutMs` | Per-job execution timeout (default 60 000 ms) |
| `scheduledAt` | When the job becomes eligible to run (enables delayed jobs) |
| `startedAt` / `completedAt` | Lifecycle timestamps |
| `result` / `error` | Handler return value / failure message |

**`JobArchive`** (`schema.prisma:124`) — a cold-storage mirror of `Job`. When a
job reaches a terminal state (`COMPLETED` or `FAILED`) it is copied here and the
`Job` row is deleted. `originalJobId` preserves the link. This keeps the hot
`Job` table small while retaining history.

---

## 2. Core Components

```
                    ┌─────────────────────────────────────────────┐
                    │              JobExecutor (facade)            │
                    │  start() · enqueue() · subscribe() · stats() │
                    └──────────────────────┬──────────────────────┘
        ┌──────────────┬──────────────────┼──────────────────┬──────────────┐
        ▼              ▼                  ▼                  ▼              ▼
  JobScheduler     JobQueue        JobExecutorContext    JobWorker     JobArchiver
  (timer/load)   (p-queue, N concurrent)  (event hub)   (run+retry)   (→ JobArchive)
```

### JobQueue — `lib/queues/job-queue.ts`
A thin wrapper around [`p-queue`](https://github.com/sindresorhus/p-queue) that
enforces concurrency. A single `JobProcessor` callback is registered by the
executor. Concurrency comes from `JOB_CONCURRENCY` (default `5`).

### JobScheduler — `lib/queues/job-scheduler.ts`
Decides *when* a job enters the in-memory queue.
- On `start()` it calls `loadExpiredJobs()`: pages through all `PENDING` jobs
  (1000 at a time), enqueues any whose `scheduledAt <= now`, and arms a
  `setTimeout` for the next future-scheduled job.
- Listens to the `job:created` and `job:rescheduled` context events to enqueue
  due jobs immediately and to re-arm the timer when a new sooner job appears.
- Long delays are capped at `MAX_TIMER_DURATION_MS` (24h) and re-evaluated on
  fire, so very-far-future jobs don't rely on a single fragile timer.

### JobWorker — `lib/queues/job-worker.ts`
Processes one job. This is the heart of the execution model:
1. Mark `PROCESSING`, set `startedAt`, increment `attempts`.
2. Look up the handler by `job.type` in the registry (404-ish error if missing).
3. Run `handler(job)` racing against a `setTimeout(job.timeoutMs)` timeout.
4. **On success** → `COMPLETED` + store `result`.
5. **On failure**:
   - If `attempts >= maxAttempts` → `FAILED` + store `error`.
   - Otherwise → set back to `PENDING` with `scheduledAt = now + backoff`,
     where `backoff = min(5 000ms · 2^(attempts-1), 5min)` (exponential, capped).
6. If the job reached a terminal state, re-fetch the fresh row and **archive** it.

### JobHandlerRegistry — `lib/queues/job-handler-registry.ts`
A `Record<type, JobHandler>` lookup. Handlers are registered at startup (see
§5). `JobHandler` is `(job: Job) => Promise<unknown>` (`job.types.ts`).

### JobArchiver — `lib/queues/job-archive.ts`
Copies a terminal `Job` into `JobArchive` and deletes the original, in two
sequential writes (see §8 caveat).

### JobExecutorContext — `lib/queues/job-executor-context.ts`
A tiny typed event emitter for the five lifecycle events:
`job:created | job:processing | job:completed | job:failed | job:rescheduled`.

### JobExecutor — `lib/queues/job-executor.ts`
The facade that wires everything together. Public API:
- `start()` — boots the scheduler (loads recoverable jobs).
- `enqueue(job)` — emits `job:created` (scheduler decides if it runs now).
- `subscribe(fn)` — fan-out over all five lifecycle events.
- `getStats()` — live `queueSize`, `pending`, `concurrency` from `p-queue`.

---

## 3. Lifecycle of a Job

```
 create  ──►  PENDING  ──(due)──►  PROCESSING  ──►  COMPLETED
                 │                      │               │
                 │                      │ fail          │  (archive → JobArchive)
                 │                      ▼               ▼
                 └─ reschedule ◄── attempts < max    FAILED ──► (archive → JobArchive)
                   (backoff)        attempts ≥ max
```

1. **Create** — a `Job` row is inserted (`PENDING`, `attempts=0`).
2. **Schedule** — `jobExecutor.enqueue(job)` emits `job:created`. The scheduler
   enqueues it immediately if `scheduledAt <= now`, else arms a timer.
3. **Process** — `p-queue` calls `JobWorker.processJob` under concurrency.
4. **Retry** — failures before `maxAttempts` flip back to `PENDING` with an
   exponential backoff and a `job:rescheduled` event; the scheduler re-arms.
5. **Archive** — `COMPLETED`/`FAILED` jobs are moved to `JobArchive` and removed
   from `Job`, so the live table only ever holds `PENDING`/`PROCESSING` rows.

Every lifecycle event is also broadcast to admin clients over SSE as a
`job.stats.updated` event (see §7).

---

## 4. Producing Jobs

There are two ways to enqueue work.

### A. Internally (from service code)

Prefer the **`JobService`** (`services/job.service.ts`) — it persists the row
*and* notifies the executor in one call:

```ts
import { jobService } from "#services/job.service";

const job = await jobService.createJob({
  type: "send-notification",
  description: "Deliver welcome emails",
  payload: { notificationIds: [...] },
  priority: "NORMAL",        // optional, default NORMAL
  scheduledAt: new Date(...), // optional → delayed job
  maxAttempts: 3,            // optional, default 3
  timeoutMs: 60_000,         // optional, default 60s
});
```

For atomicity with related writes, drop down to the repository inside a
transaction and then `enqueue` the returned row yourself — this is exactly what
the notification service does (`notification.service.ts:109`):

```ts
import { jobRepository } from "#repositories/job.repository";
import { jobExecutor } from "#states";

const job = await prisma.$transaction(async (tx) => {
  // ...create child rows in the same tx...
  return jobRepository.create({ type: "send-notification", payload, description }, tx);
});
jobExecutor.enqueue(job); // notify the scheduler AFTER the tx commits
```

> Always `enqueue()` **after** the transaction commits, so the worker never sees
> a job whose payload rows aren't visible yet.

### B. Externally (REST API)

`POST /api/jobs` (`routes/job/enqueue-job.ts`) accepts the same fields as
`createJobBodySchema` (`routes/job/schema.ts:52`) and returns the created job.
Note `scheduledAt` is sent as an ISO string.

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

The handler is keyed by the string passed as the job's `type`. Throwing rejects
the job (subject to retry/backoff); returning a value stores it as `result`.

---

## 6. The Built-in Handler: `send-notification`

The only registered handler today. When notifications are created from a template
(`createNotificationsFromTemplate`), a single `send-notification` job carrying
the `notificationIds` is created *in the same transaction* as the notification
rows. The handler (`send-notification.handler.ts`) calls `deliverNotifications`,
which dispatches per provider:

- `in-app` → emits a `notification.created` SSE event to the recipient and marks `sent`.
- `smtp-email` → dynamically imports the mailer and sends; marks `sent`/`failed`.
- others → left `pending` (skipped).

---

## 7. Observability

- **SSE push**: `states/job-executor/index.ts` subscribes to the executor and
  publishes `job.stats.updated` (target `sse:admin:*:*`) on every lifecycle
  event. Admin clients receive it via `GET /api/events` (`routes/events/streamEvents.ts`).
- **Stats endpoint**: `GET /api/jobs/stats` returns live runtime numbers
  (`queueSize`, `pending`, `concurrency`) plus DB aggregates grouped by status
  and the next scheduled time.
- **Listing**: `GET /api/jobs` (live) and `GET /api/jobs/archives` (history),
  both filterable by `status`/`type` with pagination.
- **Control**: `POST /api/jobs/:id/retry` (FAILED → PENDING), `POST /api/jobs/:id/cancel`
  (PENDING → delete), `DELETE /api/jobs/archives/:id`.

---

## 8. Configuration & Caveats

**Environment variables**
- `JOB_CONCURRENCY` — max in-flight jobs for the `p-queue` (default `5`).
- Job-level overrides: `maxAttempts` (3), `timeoutMs` (60 000), `priority` (NORMAL).

**Startup**: `jobExecutor.start()` is invoked at module load in `src/app.ts:28`.
On boot it runs `loadExpiredJobs()` to recover any `PENDING` rows left behind by
a previous/crashed process — so pending work survives restarts.

**Important limitations to keep in mind:**

- **Single-process only.** The queue, scheduler timers, and lifecycle events
  live in memory. There is **no row-level lock / "claim"** step when moving a job
  to `PROCESSING`, so running multiple API instances will cause **duplicate
  execution** — every instance's scheduler re-queues every due `PENDING` job.
  This design assumes a single long-lived process (e.g. one standalone Next.js
  server). Do not horizontally scale the API without first adding a claim/lease
  mechanism (e.g. `SELECT ... FOR UPDATE SKIP LOCKED` or an atomic
  `updateMany` conditional on `status = 'PENDING'`).

- **Retry vs. archive interaction.** `FAILED` jobs are archived and deleted from
  the `Job` table immediately. `POST /api/jobs/:id/retry` looks the job up in
  the **live `Job`** table, so by the time a human can click "retry" the failed
  job is usually already in `JobArchive` and the call will 404. Retries are
  primarily automatic (backoff); manual retry needs to target archived jobs.

- **Non-atomic archive.** `archiveAndDelete` performs `jobArchive.create` then
  `job.delete` as two separate writes (not in a transaction). A crash between
  them leaves the row duplicated. Wrapping both in `prisma.$transaction` would
  make it safe.

- **Priority is informational.** `priority` is stored and surfaced in the API but
  does not influence execution order — `p-queue` runs in FIFO insertion order.

- **Timer ceiling.** Delays beyond 24h are served by chained 24h timers; a
  process restart before the final fire re-covers them via `loadExpiredJobs()`.

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
