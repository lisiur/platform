# TODO

## Medium Priority

### Auth & Session

- [ ] **WeChat `session_key` persisted in plaintext** — written verbatim to
      `Account.accessToken` (`services/auth.service.ts:366,403`). A DB leak
      gives attackers decryption material for previously captured
      `encryptedData`. Encrypt at rest or don't persist beyond the active
      session.
- [ ] **Session table is never swept** — expired/revoked rows are only lazily
      marked and never deleted (`lib/session.ts:120-134` lazy `revokedAt`
      mark, `:159-170` `deleteSessionByToken` only sets `revokedAt`); no
      scheduled cleanup job (contrast uploads, etc.). Add a sweep that
      deletes rows where `revokedAt IS NOT NULL` or `expiresAt < now()`.

### SSE / Events / EventBus

- [ ] **SSE: write failures silently swallowed, no per-user connection cap**
      — `writeChain.then(write, () => {})` discards all rejections
      (`routes/events/streamEvents.ts:21-23`); a half-open client never
      aborts, the subscriber is never removed, and the heartbeat loop
      keeps writing. There is also no cap on concurrent SSE connections
      per user. On write failure, `unsubscribe()` + `stream.abort()`;
      track connections per `userId`.
- [ ] **`eventBus.publish` is O(subscribers × targets)** — every publish
      iterates the entire subscriber Set and runs `matches` (which splits
      strings) per comparison (`lib/event-bus.ts:29-35`); a broadcast to
      `sse:admin:*:*` walks every idle SSE connection. Index subscribers by
      the first non-wildcard segment or add a dedicated `broadcast()` path.

### System Config / Operation Logger

- [ ] **System config accepts arbitrary group/key writes with no allowlist
      or value validation** — any `system-config::upsert` holder can write
      `rate-limit.*`, `wechat.secret`, `auth.registration.enabled`, etc.
      (`routes/system-config/upsertConfig.ts`,
      `services/system-config.service.ts:5-19`); `value` is a free-form
      string regardless of `type`. Maintain an allowlist of `(group, key)`
      with per-key value schemas.

### Seed & Migrations

- [ ] **`seed.ts` is not wrapped in a transaction** — only the built-in-org
      block uses `$transaction` (`prisma/seed.ts:1318`); the other ~14
      steps are independent writes. A mid-seed failure leaves reference
      data partially updated. Wrap the whole `seed()` body in one
      `$transaction`.

## Low Priority

### Auth & Session

- [ ] **Session tokens stored in plaintext (+ raw token embedded in SSE
      target)** — looked up by exact match (`lib/session.ts:113`); a DB
      read leak yields live sessions. Unlike API tokens (SHA-256 hashed),
      sessions aren't. The raw token also lives in the event-bus subscriber
      target for the connection's lifetime
      (`routes/events/streamEvents.ts:14`). Hash at rest; subscribe by
      `sessionId`, not token.
- [ ] **No concurrent-session cap per user** — `createSession` inserts
      unconditionally (`lib/session.ts:63-84`); with no lockout, credential
      stuffing can flood a victim with sessions. Enforce a max active count
      (evict oldest).
- [ ] **No account lockout / failed-attempt tracking beyond the IP rate
      limiter** — the only brute-force control is the in-memory `authLimiter`
      (`app.ts:108-121`). A distributed or slow attack under the per-IP
      limit proceeds unimpeded; the User model has no
      `failedLoginAttempts`/`lockedUntil`. Track per-identity failures and
      lock after a threshold.
- [ ] **CSRF defense is only `SameSite=Lax`** — `session.ts:49`; no
      origin/CSRF-token check anywhere (`app.ts`). Any GET endpoint that
      mutates state would be CSRF-able, and Lax offers no defense if a
      same-site subdomain is compromised. Add a strict
      `Origin`/`Sec-Fetch-Site` check for unsafe methods.
- [ ] **WeChat app secret sent in the URL query string** — `appid`/`secret`/
      `js_code` are all URL params (`lib/wechat.ts:22-26`); WeChat requires
      this, but the secret is liable to appear in outbound proxy/HTTP-tracing
      logs. Ensure no middleware logs this request's URL.
- [ ] **`/auth/update-user` accepts API tokens with no scope check** —
      calls `requirePrincipal` (which accepts a bearer token) then acts on
      `getPrincipalUserId` with no `assertAccess` or principal-kind gate
      (`routes/auth/updateUser.ts:24-34`); a leaked token can rewrite the
      owner's profile. Require `principal.kind === "user"` for self-service
      auth mutations (mirroring the check already in
      `routes/auth/changePassword.ts:33-35`).

### Notifications

- [ ] **`listNotificationRecords` is not org/app scoped** — gated only by
      the `notification-record::list` permission with no scope constraint
      (`services/notification-record.service.ts:50-131`); a holder in any
      scope lists every notification (incl. rendered subjects/bodies)
      across all orgs/apps. Restrict by the principal's effective scope or
      treat as platform-admin-only.

### Upload

- [ ] **Magic-byte verification is shallow** — several signatures are
      minimal (webp checks only RIFF + "WEBP", PDF only `%PDF`, GIF only
      `GIF8`) (`lib/mime.ts:22-46`); a polyglot (JPEG with trailing HTML)
      passes. Use a real format-aware library (e.g. `file-type`).
- [ ] **Hotlink guard applied even to valid signed-URL requests** —
      `assertHotlinkAllowed` runs after the private-file signature check
      (`services/upload.service.ts:152`, helper at `:213-237`, config at
      `:200-211`), so a correctly-signed URL in an `<img>` on a
      non-allowlisted origin is rejected — defeating much of the purpose
      of signed URLs. Only enforce hotlink protection on
      `visibility === "public"`.
- [ ] **Dead auth check in `signFile`** — `if (!getPrincipalUserId(principal))
      throw 401` (`routes/upload/signFile.ts:32-34`) is unreachable because
      `getPrincipalUserId` always returns a non-empty string. Remove or
      replace with a real ownership check.
- [ ] **`replaceUpload` is non-atomic vs concurrent readers** — on content
      change the new file is written and the old unlinked *before* the row
      is updated (`services/upload.service.ts:385-409`); a concurrent
      `getFile` between unlink and update 404s. Update the row first, then
      unlink.

### Cache

- [ ] **Cache `getOrSet` is unused and not stampede-safe** — the cache-aside
      helper exists (`lib/cache.ts:73`) but has no callers; concurrent misses
      each fetch independently. Either adopt it (with in-flight promise
      de-dup) or remove it.
- [ ] **Cache `get<T>()` is an unchecked cast** — `set(key, unknown)`
      stores untyped and `get<T>()` blindly casts (`lib/cache.ts:40-48`). A
      wrong `T` at the read site compiles but returns garbage; keep
      read/write types aligned or add a typed wrapper.

### Jobs / Queue

- [ ] **Job `priority` is informational only** — stored and surfaced in the
      API but does not affect execution order (`p-queue` runs FIFO). Either
      wire priority into queue ordering or drop the field/docs claiming it.

### Logger / Audit

- [ ] **Audit/operation logs have no retention or pruning** — both tables
      grow forever; `deleteLogs` requires manual ID selection. Combined
      with the op-logger feedback loop, the operation log grows faster
      than necessary. Add a scheduled retention job.

### Schema & DB

- [ ] **`Notification.creatorId` has no FK/index; `status` is a free-text
      string** — `creatorId String?` with no relation (`schema.prisma:539`),
      and `status String @default("pending")` with no enum (`:545`) — typos
      like `"pendnig"` are silently accepted. Add a `creator User?`
      relation + `@@index([creatorId])` and a `NotificationStatus` enum.
- [ ] **Missing `updatedAt` on Organization/Member/Position;
      `Organization.metadata` typed `String?`** — these are user-editable
      audit-relevant models (`schema.prisma:155,228,197`) but have only
      `createdAt`; every other metadata column is `Json` while
      `Organization.metadata` is `String?` (`:154`). Add `updatedAt
      @updatedAt`; change `metadata` to `Json?`.
- [ ] **`Member.departmentId` and `Invitation.inviterId` FKs have no
      index** — `schema.prisma:225,244`. List/filter queries on those
      columns table-scan. Add `@@index`.
- [ ] **`db.ts` configures no pool sizing, statement_timeout, or logging**
      — `new PrismaClient({ adapter })` and `new PrismaPg({ connectionString })`
      pass no options (`lib/db.ts:6-11`); a runaway list query holds
      connections indefinitely. Pass `pool`/`statement_timeout` and
      `log: ['warn','error']`.
- [ ] **Only a single baseline migration; schema drift relies on
      `db:push`** — `prisma/migrations/` contains only
      `00000000000000_init/`. Later additions (Notification, ApiToken,
      RateLimitOverride, etc.) aren't captured as migrations, so prod/dev
      drift is invisible. Adopt `prisma migrate dev`/`migrate deploy` for
      schema changes.
- [ ] **`Verification` rows are never cleaned up** — `expiresAt` is set
      but unindexed, and no scheduled job deletes expired rows
      (`schema.prisma:75-85`). Add `@@index([expiresAt])` and a sweep job.

## No Dues

### Auth & Session

- [ ] **Sign-up TOCTOU race → unhandled P2002 → 500** — `signUpWithEmail`
      does `findUnique` then `createUser` without catching the unique
      violation (`services/auth.service.ts:181-192`); concurrent same-email
      signups both pass the check and the loser throws
      `PrismaClientKnownRequestError (P2002)`, surfacing as a 500. Map
      `P2002` to `409 "User already exists"`.
      **Deferred:** real-world frequency is near-zero (two humans picking
      the same email within the ~100ms window doesn't happen organically),
      and the impact is just an ugly 500 for the loser — no data
      corruption, no security breach. The `findUnique` pre-check returns a
      clean 400 for the 99.99% case, and the DB unique constraint remains
      the source of truth. Revisit only if error-monitoring noise from
      collisions becomes problematic.
- [ ] **No email verification** — `emailVerified` set false, never
      enforced; no verify endpoint in `routes/auth/`. Enforce ownership
      beyond uniqueness.
- [ ] **Account enumeration via sign-in timing** — when the user is
      missing, the `||` short-circuits and `verifyPassword` is skipped
      (`services/auth.service.ts:81-108`); argon2 makes the existing-user
      branch tens of ms slower, exposing whether an account exists. Run a
      dummy `verifyPassword` on miss to equalize timing.

### Upload

- [ ] **IDOR: `replaceUpload` / `deleteUploads` check permission but not
      ownership** — both act on caller-supplied IDs with no `uploaderId`
      filter (`routes/upload/replaceUpload.ts:36-54`,
      `routes/upload/deleteUploads.ts:37-42`; service
      `upload.service.ts:320-411`). Contrast `signFile` which enforces
      `uploaderId === userId` (`upload.service.ts:248-251`). A holder of
      `upload::replace` can silently swap any user's file content. Scope
      the `where` to `uploaderId` for non-superusers.

### Notifications

- [ ] **SMTP transporter rebuilt for every email** — `createTransport` runs
      inside `sendSmtpEmail` per call (`services/notification/mailer.ts:34-45`);
      a single SMTP timeout marks the notification `failed` with no in-service
      retry (`notification.service.ts:227-233`). Cache one transporter per
      `channelId` and rely on the job worker's retry/backoff.
      **Deferred:** not a critical problem; the job worker already handles
      retries and SMTP setup cost is negligible at expected notification volume.

### Cache

- [ ] **Cache has no TTL** — the LRU is configured with `max` only
      (`lib/cache.ts:19`); entries never expire by time and live until
      evicted or manually cleared. Add a `ttl` option (and consider
      per-namespace TTLs) so stale data can't linger.

### Jobs / Queue

- [ ] **Job queue: no row-level claim / not multi-instance safe** — the
      scheduler re-queues every due `PENDING` job and there is no atomic
      "claim" when moving to `PROCESSING`
      (`lib/queues/job-worker.ts:22`). Multiple API instances will
      **duplicate-execute**. Add `SELECT … FOR UPDATE SKIP LOCKED` or a
      conditional `updateMany` on `status = 'PENDING'` before processing.
      See `ARCHITECTURE.md` §8.
      **Deferred:** the service runs in-process inside Next.js as a
      single long-lived process by design (ARCHITECTURE.md §8), so no
      duplicate execution occurs today. This only bites if the API is
      horizontally scaled — PM2/Node cluster mode, rolling or blue-green
      deploys with overlap, Docker `replicas > 1`, or Next.js standalone
      with multiple workers — none of which are on the roadmap. Revisit
      when multi-instance deployment is actually planned.

## Not Planned

### Cache

- [ ] **Cache invalidation is coarse (whole-namespace)** — channel/template
      mutations call `notificationChannelCache.clear()` /
      `notificationTemplateCache.clear()`, flushing *all* entries instead
      of the affected key (`services/notification/channel.service.ts:159-160`,
      `services/notification/template.service.ts:179`).
      **Deferred:** targeted `delete(key)` is straightforward for the
      cache's *own* mutation (template cache is keyed by template `key`;
      channel cache by channel `id`), but the template cache embeds the
      channel relation (`findTemplateForDelivery` does
      `include: { channel: true }`), so a channel update must also
      invalidate every cached template whose `channelId` matches — and
      there's no reverse index from `channelId` to cached template keys.
      The three options all fail cost/benefit: (a) `delete(id)` only on
      the channel cache leaves stale channel config/enabled state in
      cached templates (correctness regression); (b) keep
      `notificationTemplateCache.clear()` only on channel update retains
      a whole-namespace flush on exactly that path; (c) iterate `keys()`
      and inspect each cached value's `channelId` is O(cache size) and
      over-engineered for the benefit. Channel/template mutations are
      admin-only, low-frequency paths, so the coarse flush costs
      negligible redundant DB refetches in practice. Revisit if/when
      notification config becomes a hot write path or the cache grows
      beyond `CACHE_MAX_SIZE=1000`.

### Infra / Boot

- [ ] **Boot-time side effects** — `seed()` + `jobExecutor.start()` run at
      module boot (`src/app.ts:27-44`). Anti-pattern for
      serverless/standalone Next.js; risks cold-start races. Move to
      deploy/migration step.

### Rate Limit

- [ ] **Rate limit counters are in-memory / not multi-instance safe** —
      each instance counts independently, so behind a load balancer the
      effective per-subject limit is ~`N × max`
      (`lib/rate-limit-store.ts`). Same single-process constraint as
      Jobs/Cache; an external store (Redis) or shared Postgres counter is
      needed before scaling horizontally.

### SSE / Events / Session

- [ ] **New SSE/event-bus/session issues share the single-process caveat**
      — the SSE per-user connection cap, event-bus O(subscribers)
      publish, and plaintext in-process session store are all unfixable
      without an external broker/shared store; same horizontal-scaling
      blocker as Jobs/Cache/Rate-limit above.
