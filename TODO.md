# TODO

## High Priority

- [ ] **`deleteOrganization` orphans org-scoped Roles and RoleAssignments** —
      `organization.delete` cascades to Member/Department/Position but there is
      no relation to the polymorphic `Role`/`RoleAssignment` (scope-modeled), so
      they stay (`services/organization.service.ts:127-134`). Worse,
      `getAllUserPermissionCodes` pulls permissions by `userId` with no scope
      filter, so orphaned assignments keep granting the deleted org's permissions
      globally (used for API-token scope validation). Sweep both tables scoped to
      the org before delete.
- [ ] **`Member` has no unique constraint on `(organizationId, userId)`** —
      `schema.prisma:217-232` only indexes the FKs. A double-submitted invite
      accept, retry, or `registerOrganizationForUser` called twice creates
      duplicate memberships (double-counted in lists, owner role attached twice).
      Add `@@unique([organizationId, userId])` and switch creates to `upsert`.
- [ ] **Soft-deleted Application / NotificationChannel / NotificationTemplate
      can't be re-created by natural key** — each carries `deletedAt` but the
      unique index is plain: `@@unique([code])` (`schema.prisma:319`),
      `@@unique([key])` (`:506`, `:533`). After a soft-delete the pre-check
      reports "not found" but re-create throws `P2002` → 500. Replace with
      partial unique indexes `WHERE "deletedAt" IS NULL`.
- [ ] **`updateUser` writes password and user fields non-atomically** — the
      credential `account.update` and the `user.update` are two independent
      writes with no `$transaction` (`services/user.service.ts:159-186`). If the
      user update fails (email `P2002`, DB blip) the password is already changed
      — a partial state the caller never sees. Wrap both in `prisma.$transaction`.

## Medium Priority

- [ ] **Client loses RPC type safety** — manual `as` casts (`use-current-organization.ts:16`)
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
- [ ] **Sign-up TOCTOU race → unhandled P2002 → 500** — `signUpWithEmail` does
      `findUnique` then `createUser` without catching the unique violation
      (`services/auth.service.ts:156-167`); concurrent same-email signups both
      pass the check and the loser throws `PrismaClientKnownRequestError (P2002)`,
      surfacing as a 500. Map `P2002` to `409 "User already exists"`.
- [ ] **`assignPermissions` allows cross-app privilege grants** — blindly creates
      RolePermission rows for any permission IDs
      (`services/role-permission.service.ts:52-62`); `getPermissionAppWhere`
      includes `appId IS NULL` permissions for every scope (`:45-50`). Attaching
      a system permission (e.g. `user::delete`, `appId = null`) to an org role
      grants it to every holder of that org role. Reject when `permission.appId`
      is neither null-and-platform-role nor equal to `role.appId`.
- [ ] **TOCTOU in last-org-owner protection** — `removeMember` does findFirst →
      isOrgOwner → countOrgOwners → delete as separate, non-transactional steps
      (`services/member.service.ts:59-76`). Two concurrent removes of the last
      two owners each observe `ownerCount === 2` and both proceed, leaving the
      org with zero owners. Wrap the count + delete in `$transaction`.
- [ ] **No last-platform-admin lockout protection** — org owners are guarded by
      `countOrgOwners` (`member.service.ts:67-73`), but the platform `admin` role
      has no equivalent: `updateUser` (`services/user.service.ts:188-218`) and
      `removeUserRole` (`repositories/user-role.repository.ts:86-96`) can strip
      the last admin assignment. Count remaining admin assignments and reject
      with 409 at zero.
- [ ] **Operation logger creates a row for every GET on the log endpoints** —
      `shouldSkipOperationLog` matches `^/api/log(?:/[^/]+)?$`
      (`middleware/operation-logger.ts:43-46`) but the real routes are
      `/api/operation-logs` and `/api/audit-logs` (`routes/index.ts:42-43`).
      Polling dashboards grow the operation log with every poll. Fix the regex
      to `^/api/(operation-logs|audit-logs)(/[^/]+)?$`.
- [ ] **Audit log records a spoofable client IP** — `logAudit` reads IP via a
      local helper that blindly takes `x-forwarded-for[0]`/`x-real-ip`
      (`lib/logger.ts:144-152`), ignoring the proxy-aware `resolveClientIp` in
      `lib/client-ip.ts`. The same naive extraction populates `session.ipAddress`
      (`routes/auth/signInEmail.ts:30-32`). Use `resolveClientIp` everywhere.
- [ ] **No audit on change-password, user delete, or permission denials** —
      `changePassword` (`routes/auth/changePassword.ts`) and `deleteUser`
      (`routes/user/deleteUser.ts`) write no audit row; `assertAccess` throws 403
      with no audit (`services/role-permission.service.ts:291,300-304,319,323`),
      so `AuditOutcome "denied"` is dead code. Emit `logAudit` for these events.
- [ ] **Password policy is far too weak** — sign-up and change-password both use
      `z.string().min(6)` (`routes/auth/schema.ts:57,67`); no max length (argon2
      DoS on huge input), no complexity, no breach check, and no centralized
      policy helper in `lib/password.ts`. Enforce a sensible min (10–12), cap
      input length, and centralize the rules.
- [ ] **System config accepts arbitrary group/key writes with no allowlist or
      value validation** — any `system-config::upsert` holder can write
      `rate-limit.*`, `wechat.secret`, `auth.registration.enabled`, etc.
      (`routes/system-config/upsertConfig.ts`,
      `services/system-config.service.ts:5-19`); `value` is a free-form string
      regardless of `type`. Maintain an allowlist of `(group, key)` with per-key
      value schemas.
- [ ] **SMTP headers not sanitized; `from` not validated as an email** — channel
      `from` is `z.string().min(1)` (`services/notification/provider.ts:26-33`,
      `routes/notification-channel/schema.ts:40-46`) and per-message
      `to`/`subject` are unchecked (`services/notification/mailer.ts:47-52`) —
      CRLF/mail-header injection risk. Validate with `z.email()` and reject any
      `\r`/`\n`.
- [ ] **SMTP transporter rebuilt for every email** — `createTransport` runs
      inside `sendSmtpEmail` per call (`services/notification/mailer.ts:34-45`);
      a single SMTP timeout marks the notification `failed` with no in-service
      retry (`notification.service.ts:227-233`). Cache one transporter per
      `channelId` and rely on the job worker's retry/backoff.
- [ ] **WeChat `session_key` persisted in plaintext** — written verbatim to
      `Account.accessToken` (`services/auth.service.ts:318,349`). A DB leak gives
      attackers decryption material for previously captured `encryptedData`.
      Encrypt at rest or don't persist beyond the active session.
- [ ] **`Account` lacks `@@unique([providerId, accountId])`** —
      `schema.prisma:54-72`. WeChat lookup is `findFirst` by `(wechat, openid)`
      (`auth.service.ts:305-311`); a first-login race from two devices can create
      duplicate Account rows. Add the unique constraint and handle `P2002` as 409.
- [ ] **`createNotificationsFromTemplate` disabled-template branch is not
      transactional** — the enabled branch uses `$transaction`
      (`notification.service.ts:109`), but the disabled branch uses `Promise.all`
      of independent `prisma.notification.create` (`:75-91`); a mid-iteration
      failure leaves a partial set of `failed` rows. Replace with a single
      `$transaction` loop.
- [ ] **SSE: write failures silently swallowed, no per-user connection cap** —
      `writeChain.then(write, () => {})` discards all rejections
      (`routes/events/streamEvents.ts:21-23`); a half-open client never aborts,
      the subscriber is never removed, and the heartbeat loop keeps writing.
      There is also no cap on concurrent SSE connections per user. On write
      failure, `unsubscribe()` + `stream.abort()`; track connections per
      `userId`.
- [ ] **Session table is never swept** — expired/revoked rows are only lazily
      marked and never deleted (`lib/session.ts:112-117,142-153`); no scheduled
      cleanup job (contrast uploads, etc.). Add a sweep that deletes rows where
      `revokedAt IS NOT NULL` or `expiresAt < now()`.
- [ ] **`assignRole` scope validation is asymmetric — PLATFORM roles assignable
      at ORG scope** — only an ORGANIZATION role under a mismatched scope is
      rejected (`services/role-permission.service.ts:90-100`,
      `repositories/user-role.repository.ts:59-67`); a PLATFORM role (e.g.
      `admin`) can be assigned with `scopeType = ORGANIZATION`. Require
      `params.scopeType === role.scopeType`.
- [ ] **Built-in applications can be soft-deleted** — `deleteApplication` only
      sets `deletedAt` with no builtin guard
      (`services/application.service.ts:76-88`). Soft-deleting the `organization`
      app leaves orphaned Role/Permission/Menu rows and silently degrades org
      permission/menu resolution. Refuse to soft-delete apps whose code is
      `admin`/`organization`.
- [ ] **Client-supplied trace-id trusted verbatim** — `x-trace-id`/`x-request-id`
      is taken straight from headers with no format/length check
      (`middleware/trace-context.ts:4-7`) and propagates into audit/operation
      logs. An attacker can inject huge strings or collide ids to skew log
      correlation. Only accept values matching `^[0-9a-f-]{8,64}$`, else
      `crypto.randomUUID()`.
- [ ] **Permission `@@unique([appId, code])` doesn't enforce uniqueness for
      system perms** — Postgres treats NULLs as distinct (`schema.prisma:373`),
      so `seed.ts` uses `findFirst`+`create` instead of a real upsert
      (`prisma/seed.ts:889-917`); concurrent seeds can duplicate system
      permissions. Add a partial unique index `ON permission(code) WHERE "appId"
      IS NULL`.
- [ ] **`seed.ts` is not wrapped in a transaction** — only the built-in-org block
      uses `$transaction` (`prisma/seed.ts:1353`); the other ~14 steps are
      independent writes. A mid-seed failure leaves reference data partially
      updated. Wrap the whole `seed()` body in one `$transaction`.
- [ ] **`eventBus.publish` is O(subscribers × targets)** — every publish iterates
      the entire subscriber Set and runs `matches` (which splits strings) per
      comparison (`lib/event-bus.ts:29-35`); a broadcast to `sse:admin:*:*`
      walks every idle SSE connection. Index subscribers by the first
      non-wildcard segment or add a dedicated `broadcast()` path.

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
- [ ] **Session tokens stored in plaintext (+ raw token embedded in SSE target)**
      — looked up by exact match (`lib/session.ts:104`); a DB read leak yields
      live sessions. Unlike API tokens (SHA-256 hashed), sessions aren't. The
      raw token also lives in the event-bus subscriber target for the
      connection's lifetime (`routes/events/streamEvents.ts:14`). Hash at rest;
      subscribe by `sessionId`, not token.
- [ ] **No concurrent-session cap per user** — `createSession` inserts
      unconditionally (`lib/session.ts:63-84`); with no lockout, credential
      stuffing can flood a victim with sessions. Enforce a max active count
      (evict oldest).
- [ ] **No account lockout / failed-attempt tracking beyond the IP rate limiter**
      — the only brute-force control is the in-memory `authLimiter`
      (`app.ts:86-97`). A distributed or slow attack under the per-IP limit
      proceeds unimpeded; the User model has no
      `failedLoginAttempts`/`lockedUntil`. Track per-identity failures and lock
      after a threshold.
- [ ] **Magic-byte verification is shallow** — several signatures are minimal
      (webp checks only RIFF + "WEBP", PDF only `%PDF`, GIF only `GIF8`)
      (`lib/mime.ts:22-46`); a polyglot (JPEG with trailing HTML) passes. Use a
      real format-aware library (e.g. `file-type`).
- [ ] **Hotlink guard applied even to valid signed-URL requests** —
      `assertHotlinkAllowed` runs after the private-file signature check
      (`services/upload.service.ts:153,214-238`), so a correctly-signed URL in an
      `<img>` on a non-allowlisted origin is rejected — defeating much of the
      purpose of signed URLs. Only enforce hotlink protection on
      `visibility === "public"`.
- [ ] **Audit/operation logs have no retention or pruning** — both tables grow
      forever; `deleteLogs` requires manual ID selection. Combined with the
      op-logger feedback loop, the operation log grows faster than necessary. Add
      a scheduled retention job.
- [ ] **`Notification.creatorId` has no FK/index; `status` is a free-text
      string** — `creatorId String?` with no relation (`schema.prisma:551`), and
      `status String @default("pending")` with no enum (`:557`) — typos like
      `"pendnig"` are silently accepted. Add a `creator User?` relation +
      `@@index([creatorId])` and a `NotificationStatus` enum.
- [ ] **Missing `updatedAt` on Organization/Member/Position; `Organization.metadata`
      typed `String?`** — these are user-editable audit-relevant models
      (`schema.prisma:154,227,196`) but have only `createdAt`; every other
      metadata column is `Json` while `Organization.metadata` is `String?`
      (`:153`). Add `updatedAt @updatedAt`; change `metadata` to `Json?`.
- [ ] **`Member.departmentId` and `Invitation.inviterId` FKs have no index** —
      `schema.prisma:224,234-249`. List/filter queries on those columns
      table-scan. Add `@@index`.
- [ ] **`db.ts` configures no pool sizing, statement_timeout, or logging** —
      `new PrismaClient({ adapter })` and `new PrismaPg({ connectionString })`
      pass no options (`lib/db.ts:6-11`); a runaway list query holds connections
      indefinitely. Pass `pool`/`statement_timeout` and `log: ['warn','error']`.
- [ ] **Only a single baseline migration; schema drift relies on `db:push`** —
      `prisma/migrations/` contains only `00000000000000_init/`. Later additions
      (Notification, ApiToken, RateLimitOverride, etc.) aren't captured as
      migrations, so prod/dev drift is invisible. Adopt `prisma migrate dev`/
      `migrate deploy` for schema changes.
- [ ] **`Verification` rows are never cleaned up** — `expiresAt` is set but
      unindexed, and no scheduled job deletes expired rows
      (`schema.prisma:74-84`). Add `@@index([expiresAt])` and a sweep job.
- [ ] **Dead auth check in `signFile`** — `if (!getPrincipalUserId(principal))
      throw 401` (`routes/upload/signFile.ts:32-34`) is unreachable because
      `getPrincipalUserId` always returns a non-empty string. Remove or replace
      with a real ownership check.
- [ ] **`replaceUpload` is non-atomic vs concurrent readers** — on content change
      the new file is written and the old unlinked *before* the row is updated
      (`services/upload.service.ts:385-409`); a concurrent `getFile` between
      unlink and update 404s. Update the row first, then unlink.
- [ ] **CSRF defense is only `SameSite=Lax`** — `session.ts:49`; no origin/CSRF-
      token check anywhere (`app.ts`). Any GET endpoint that mutates state would
      be CSRF-able, and Lax offers no defense if a same-site subdomain is
      compromised. Add a strict `Origin`/`Sec-Fetch-Site` check for unsafe
      methods.
- [ ] **WeChat app secret sent in the URL query string** — `appid`/`secret`/
      `js_code` are all URL params (`lib/wechat.ts:22-26`); WeChat requires this,
      but the secret is liable to appear in outbound proxy/HTTP-tracing logs.
      Ensure no middleware logs this request's URL.
- [ ] **`/auth/update-user` and `/auth/change-password` accept API tokens with no
      scope check** — both call `requirePrincipal` (which accepts a bearer token)
      then act on `getPrincipalUserId` with no `assertAccess`
      (`routes/auth/updateUser.ts:24-32`, `routes/auth/changePassword.ts:29-39`);
      `update-user` has no password gate, so any leaked token can rewrite the
      owner's profile. Require `principal.kind === "user"` for self-service auth
      mutations.
- [ ] **`listNotificationRecords` is not org/app scoped** — gated only by the
      `notification-record::list` permission with no scope constraint
      (`services/notification-record.service.ts:50-131`); a holder in any scope
      lists every notification (incl. rendered subjects/bodies) across all
      orgs/apps. Restrict by the principal's effective scope or treat as
      platform-admin-only.

## No Dues

- [ ] **No email verification** — `emailVerified` set false, never enforced; no verify
      endpoint in `routes/auth/`. Enforce ownership beyond uniqueness.
- [ ] **Job queue: no row-level claim / not multi-instance safe** — the scheduler re-queues
      every due `PENDING` job and there is no atomic "claim" when moving to `PROCESSING`
      (`lib/queues/job-worker.ts:22`). Multiple API instances will **duplicate-execute**.
      Add `SELECT … FOR UPDATE SKIP LOCKED` or a conditional `updateMany` on
      `status = 'PENDING'` before processing. See `ARCHITECTURE.md` §8.
      **Deferred:** the service runs in-process inside Next.js as a single long-lived
      process by design (ARCHITECTURE.md §8), so no duplicate execution occurs today.
      This only bites if the API is horizontally scaled — PM2/Node cluster mode,
      rolling or blue-green deploys with overlap, Docker `replicas > 1`, or Next.js
      standalone with multiple workers — none of which are on the roadmap. Revisit
      when multi-instance deployment is actually planned.
- [ ] **Account enumeration via sign-in timing** — when the user is missing,
      the `||` short-circuits and `verifyPassword` is skipped
      (`services/auth.service.ts:80-86`); argon2 makes the existing-user branch
      tens of ms slower, exposing whether an account exists. Run a dummy
      `verifyPassword` on miss to equalize timing.
- [ ] **IDOR: `replaceUpload` / `deleteUploads` check permission but not
      ownership** — both act on caller-supplied IDs with no `uploaderId` filter
      (`routes/upload/replaceUpload.ts:36-54`,
      `routes/upload/deleteUploads.ts:37-42`; service `upload.service.ts:320-411`).
      Contrast `signFile` which enforces `uploaderId === userId`
      (`upload.service.ts:248-251`). A holder of `upload::replace` can silently
      swap any user's file content. Scope the `where` to `uploaderId` for
      non-superusers.

## Not Planned

- [ ] **Boot-time side effects** — `seed()` + `jobExecutor.start()` run at module boot
      (`src/app.ts:18-35`). Anti-pattern for serverless/standalone Next.js; risks cold-start
      races. Move to deploy/migration step.
- [ ] **Rate limit counters are in-memory / not multi-instance safe** — each instance counts
      independently, so behind a load balancer the effective per-subject limit is ~`N × max`
      (`lib/rate-limit-store.ts`). Same single-process constraint as Jobs/Cache; an external
      store (Redis) or shared Postgres counter is needed before scaling horizontally.
- [ ] **New SSE/event-bus/session issues share the single-process caveat** — the
      SSE per-user connection cap, event-bus O(subscribers) publish, and
      plaintext in-process session store are all unfixable without an external
      broker/shared store; same horizontal-scaling blocker as Jobs/Cache/Rate-
      limit above.
