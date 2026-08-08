# TODO

## Medium Priority

### Auth & Session

- [ ] **WeChat `session_key` persisted in plaintext** [#4](https://github.com/lisiur/platform/issues/4) — written verbatim to
      `Account.accessToken` (`services/auth.service.ts:385,424`). A DB leak
      gives attackers decryption material for previously captured
      `encryptedData`. Encrypt at rest or don't persist beyond the active
      session.

- [ ] **Admin `updateUser` doesn't lowercase email → login lockout + case
      duplicates** — `createUser`/`signInWithEmail` lowercase the email
      (`auth.service.ts:252,82`) but `updateUser` stores it verbatim and
      uniqueness-checks the raw value (`user.service.ts:141-153`). An admin
      setting `User@Example.com` makes the user un-loginable (sign-in
      lowercases → not found) and lets a case-only-different account slip past
      the `findUnique` uniqueness check. Normalize to lowercase before both
      the check and the write.
- [ ] **`emailVerified` is not reset when an admin changes a user's email**
      — `updateUser` writes the new `email` but never touches `emailVerified`
      (`user.service.ts:151-161`); the new, unverified address silently
      inherits the old address's verified status. Set `emailVerified: false`
      (and trigger re-verification) when `email` changes.
- [ ] **`tokenHash` leaked in `/api-tokens/verify` response** — every other
      API-token path goes through `toPublic()` which strips `tokenHash`, but
      `verify` returns `principal.token` directly
      (`routes/api-token/verify.ts:22`) and `getApiTokenByBearer` only strips
      the `owner` relation (`shared/lib/api-token.ts:55-56`). The Zod response
      schema does not strip fields at runtime, so `tokenHash` reaches the
      client. Apply `toPublic()` before serializing.
- [ ] **Banned-account status leaked in WebAuthn login defeats the
      anti-enumeration design** — `verifyAuthentication` routes every failure
      through a uniform `fail()` → `400 "Authentication failed"`
      (`webauthn.service.ts:401-417`), but `assertNotBanned(user)` is called
      *before* credential verification (`:481`) and throws a distinct `403`
      carrying the internal `banReason` (`auth.service.ts:32-35`). An attacker
      probing a known email learns the user exists, is banned, and reads the
      ban reason. Move the check to *after* successful verification and route
      it through the generic error.
- [ ] **`resetPassword` audit log omits the target user** — the
      `user.password_reset` audit entry records only `userId: actorId` (the
      admin performing the reset) and never the target user whose password
      changed (`user.service.ts:245-252`). After the fact it is impossible to
      tell whose password was reset. Add `metadata: { targetUserId: id }`.

### SSE / Events / EventBus

- [ ] **SSE: write failures silently swallowed, no per-user connection cap**
      [#2](https://github.com/lisiur/platform/issues/2) — `writeChain.then(write, () => {})` discards all rejections
      (`routes/events/streamEvents.ts:21-23`); a half-open client never
      aborts, the subscriber is never removed, and the heartbeat loop
      keeps writing. Partial mitigations exist: the `onEvent` handler
      now checks `stream.aborted || stream.closed` (`:32`), and
      `onClose: () => stream.abort()` is wired (`:42`), but a write
      rejection still doesn't trigger `unsubscribe()`. There is also
      no cap on concurrent SSE connections per user. On write failure,
      call `unsubscribe()` + `stream.abort()`; track connections per
      `userId`.

### System Config / Operation Logger

- [ ] **System config accepts arbitrary group/key writes with no allowlist
      or value validation** [#5](https://github.com/lisiur/platform/issues/5) — any `system-config::upsert` holder can write
      `rate-limit.*`, `wechat.secret`, `auth.registration.enabled`, etc.
      (`routes/system-config/upsertConfig.ts`,
      `services/system-config.service.ts:5-19`); `value` is a free-form
      string regardless of `type`. Maintain an allowlist of `(group, key)`
      with per-key value schemas.

### Seed & Migrations

- [ ] **`seed.ts` is not wrapped in a transaction** [#3](https://github.com/lisiur/platform/issues/3) — only the built-in-org
      block uses `$transaction` (`prisma/seed.ts:1449`); the other ~15
      steps are independent writes. A mid-seed failure leaves reference
      data partially updated. Wrap the whole `seed()` body in one
      `$transaction`.

### Access Control / Organization

- [ ] **`removeMember` does not revoke org-scoped `RoleAssignment`s — removed
      members keep all permissions** — `removeMember` only deletes the
      `Member` row (`modules/organization/member.service.ts:77`); it never
      removes the user's role assignments at that org's scope. Position-based
      roles (`position.service.ts:280`) and direct org roles persist
      indefinitely. Compare `deleteOrganization`, which does
      `roleAssignment.deleteMany(roleAssignmentWhereByRoleScope(orgScope(id)))`
      (`organization.service.ts:260-263`). An expelled member can keep calling
      `org/*`-gated endpoints forever. Add the same `deleteMany` inside
      `removeMember`'s transaction.
- [ ] **`updateMember` lets org admins mutate the global `User.name`
      (cross-tenant)** — an org admin with `org/organization-member:update`
      can overwrite `prisma.user.name` (`member.service.ts:108-113`), visible
      in every other org and across the platform. Remove the `User.name`
      update from the org-scoped endpoint (use a per-org `Member` display name
      if needed).
- [ ] **`reorderMenus` allows cross-app moves, non-`GROUP` parents, and
      cyclic parent chains** — items are applied with no `appId` filter on
      `existingMenus`, no same-app/`linkType === "GROUP"` parent check, and no
      cycle detection (`modules/application/menu.service.ts:307-358`). Cycles
      corrupt `fillAncestorGroups` traversal; cross-app nesting surfaces menus
      under the wrong app. Validate the three invariants before applying.
- [ ] **`updateDepartment` only guards direct self-parent — multi-node cycles
      are possible** — the guard is `parentId === id` only
      (`modules/organization/department.service.ts:90-106`); setting A→B then
      B→A creates a cycle that breaks delete/reparent traversal. Walk the
      ancestor chain from `parentId` and reject if `id` is encountered.

### AI Agent / Cost Abuse

- [ ] **No `maxOutputTokens` cap on the chat stream (unbounded per-request
      cost)** — `streamText({ ... })` sets no output cap
      (`shared/lib/ai-agent/agent.ts:88-99`), unlike the title generator which
      caps at 1000 (`sendMessage.ts:85`). One turn can elicit an arbitrarily
      long (reasoning) response. Add a configurable `maxOutputTokens`.
- [ ] **No per-user rate limit, turn cap, or token budget on `sendMessage`**
      — only the global limiter applies (default 300/min); each accepted
      request fans out to 1 stream + 1 fire-and-forget title call + up to 8
      internal `call_api` tool calls that bypass rate limiting
      (`rate-limit.ts:30`). Add a tighter dedicated limiter and a per-user /
      per-session token accumulator.
- [ ] **Unbounded conversation history reloaded and re-sent every turn** —
      `sendMessage` `findMany`s *all* prior `AgentMessage` rows with no cutoff
      and passes them to the provider
      (`routes/agent/sendMessage.ts:147-156`); nothing prunes/summarises,
      `AgentMessage.parts` stores full tool outputs, and `AgentSession` has no
      TTL/GC. Cap reloaded history (count or tokens) and add a session/message
      reaper.
- [ ] **No maximum prompt length** — `promptRequestSchema` is
      `z.string().trim().min(1)` with no `.max()`
      (`sendMessage.ts:34-36`); the 2 MB global body limit permits ~500K
      tokens in one user message. Add an explicit cap; also cap the
      `toolResults` array (currently `.min(1)` only, `:51`).
- [ ] **Unbounded buffering of tool/API responses into memory and history**
      — `executeApiCall` does `await res.text()` with no ceiling
      (`shared/lib/ai-agent/tools/call-api.ts:93-94`); a large list/search
      payload is buffered, persisted into `AgentMessage.parts`
      (`sendMessage.ts:224-259`), and re-sent every subsequent turn. Enforce a
      byte cap and truncate tool results.
- [ ] **No server-side timeout on the upstream LLM stream** — `streamAgent`
      passes only the client disconnect signal (`agent.ts:88-99`,
      `sendMessage.ts:197-204`); a hung provider keeps the request, stream,
      and DB connection open indefinitely. Combine the client signal with
      `AbortSignal.timeout(...)`.
- [ ] **Lazy session creation with no `id` validation** — the messaging route
      uses `c.req.param("id")` raw and `ensureSession` will *create* a session
      with that arbitrary string as the PK (`AgentSession.id` is a `String
      @id`, not UUID). File uploads then throw "Invalid sessionId"
      (`agent-file-store.ts:37-39`, which *does* validate UUID), and the
      `agent_session` table can be flooded. Apply the existing
      `sessionIdParamSchema` (`schema.ts:4`) on the route.
- [ ] **Stream-persistence failures in `onFinish` are swallowed** — the
      assistant turn is persisted in a `try/catch` that only `console.error`s
      (`sendMessage.ts:224-269`); on DB failure the user has already seen the
      answer but nothing is saved, leaving a dangling user turn. Retry with
      backoff and emit a client signal so the UI can mark the turn unsaved.
- [ ] **Title-update SSE event is hardcoded to the `admin` namespace** —
      `eventBus.publish({ target: \`sse:admin:${userId}:*\` ... })`
      (`sendMessage.ts:97-102`) always targets admin, but the module supports
      the org scope (`org/agent:chat`); org-portal users never see the
      auto-generated title until reload. Derive the namespace from
      `principalScope`.

### Jobs / Queue

- [ ] **`loadExpiredJobs` can infinite-loop and enqueue the same job multiple
      times** — the `while (true)` loop calls `findPendingJobs({ limit: 1000 })`
      which filters only `status: PENDING` with no `scheduledAt <= now` filter
      and no pagination offset (`job-instance.repository.ts:37-43`;
      `job-scheduler.ts:28-52`). With ≥1000 future-PENDING rows the same page
      returns forever (event-loop peg, DB flood, startup hang); with due jobs,
      the same row is re-added to the queue before the worker flips it to
      PROCESSING → duplicate execution. Push the due-filter into the query,
      keyset-paginate, and claim rows atomically before enqueue.
- [ ] **Crashed/stuck `PROCESSING` jobs are never recovered** — `PROCESSING`
      is only ever written (`job-worker.ts:20`); nothing transitions it back.
      If the process dies mid-job the row is stuck `PROCESSING` forever and
      silently dropped (`findPendingJobs` won't return it; the sweep handler
      only deletes `COMPLETED`/`FAILED`). Add a `claimAt`/`startedAt` column
      and a recovery sweep that re-queues stale `PROCESSING` rows.
- [ ] **Job timeout doesn't cancel the handler and leaks the timer → double
      execution** — `Promise.race([handler, timeout])` neither aborts
      `handler(job)` nor `clearTimeout`s the winner
      (`shared/lib/queues/job-worker.ts:32-36`). On timeout the row is marked
      PENDING for retry while the original handler keeps running and completes
      its side effects (email/sweep) — the retry then repeats them. Pass an
      `AbortController` into handlers and abort on timeout; clear the timer in
      `finally`.
- [ ] **Job-cancellation is a check-then-delete race with no audit / no
      `CANCELLED` status** — `cancelInstance` reads `status === PENDING` then
      `delete`s (`job-instance.service.ts:57-67`); the worker can flip the row
      to `PROCESSING` in between, so `delete` removes a running job and the
      handler's final `updateStatus` throws `P2025` (unhandled). Use a
      conditional `deleteMany({ id, status: PENDING })` (409 if 0 rows), and
      add a `CANCELLED` status via `updateStatus` instead of hard delete.
- [ ] **Scheduling >24 days out fires prematurely or never** — `scheduleNext`
      caps delays >24h to a re-check, but `rescheduleIfNeeded`/`setTimer` only
      arm a timer when `delay <= MAX_TIMER_DURATION_MS` and call
      `setTimeout(delay)` uncapped (`job-scheduler.ts:81-110`); Node clamps
      `setTimeout` at ~24.8d (fires almost immediately) and a >24d job created
      into an empty queue arms nothing (never scheduled). Route all arming
      through `scheduleNext`'s cap behavior.
- [ ] **Cron runs in the host's local timezone with no per-job timezone** —
      `new Cron(expression)` passes no `timezone`
      (`shared/lib/cron.ts:3-18`; `Job` has no timezone column,
      `schema.prisma:134-154`), so `"0 9 * * *"` means "09:00 in whatever the
      container's TZ is" and shifts if deployment TZ changes. Store/validate
      an IANA `timezone` and default explicitly to UTC.
- [ ] **Overlapping executions of the same cron job** — `claimDueTemplates`
      advances `nextRunAt` from *now* before the instance runs
      (`job.repository.ts:88-116`); a run slower than its interval is
      re-dispatched and runs concurrently (compounded delivery, concurrent
      deletes on the same sweep rows). Skip dispatch while a non-terminal
      instance exists, or advance from the prior `nextRunAt`.
- [ ] **HTML injection via unescaped template variables in email body** —
      `renderTemplate` substitutes variable values verbatim
      (`modules/notification/services/template-renderer.ts:67-89`) and the
      result is sent as `html:` to nodemailer with no escaping
      (`mailer.ts:70-81`). A partly user-controlled variable (e.g. `userName`,
      or admin test `variables`) injects arbitrary HTML/links/tracking pixels.
      HTML-escape substitutions (or use an auto-escaping template engine).
- [ ] **Per-notification retry is abandoned — a single SMTP blip permanently
      fails the notification** — `deliverNotifications` marks a row `FAILED` on
      the first SMTP error (`notification.service.ts:192-240`), and the
      `attempts`/`nextAttemptAt` columns exist but are never written
      (`schema.prisma:590-591`); the wrapping job retries, but re-entry skips
      non-`PENDING` rows (`:163-167`), so a transient outage drops the email
      for good with no dead-letter path. On transient errors leave `PENDING`,
      bump `attempts`/`nextAttemptAt` with backoff; only `FAILED` after N.

### Upload / Attachment

- [ ] **`createAttachment` accepts arbitrary, unvalidated `bizType`/`bizId`
      (tenant-isolation bypass + data pollution)** — the multipart
      `bizType`/`bizId` are read raw and passed through with only
      `requirePrincipal` (no permission check, no allow-list)
      (`routes/attachment/createAttachment.ts:41-62`;
      `attachment.service.ts:53-60,122-130`). Internal consumers treat
      `(bizType, bizId)` as a trusted tenant scope (`user:avatar`,
      `organization:logo`, `application:favicon`), so any authenticated user
      can create attachment rows under another tenant's namespace. Validate
      `bizType` against an allow-list and authorize the caller against `bizId`
      for each type.
- [ ] **Concurrent delete race → unhandled `P2025` → 500; non-transactional
      file cleanup** — in `deleteAttachments`/`deleteAttachmentsByBiz`, two
      attachments sharing one `Upload` can both observe `count === 0` and both
      call `upload.delete`, the second throwing `P2025` (outside the `unlink`
      try/catch) → 500 though the delete already succeeded
      (`attachment.service.ts:380-399,401-430`); the unlink/delete sequence is
      also not transactional, so a crash leaves disk/DB out of sync. Use a
      conditional `deleteMany` + commit-before-unlink, and guard `P2025`.
- [ ] **SSE has an unbounded per-connection write queue → memory exhaustion
      under backpressure** — every event/heartbeat is chained onto
      `writeChain = writeChain.then(write, () => {})`; a stalled client makes
      `stream.writeSSE` neither resolve nor reject, so the chain (each closure
      retaining the full payload) grows without bound
      (`routes/events/streamEvents.ts:20-23,29-43`). A few slow readers
      exhaust heap. Bound the per-connection queue and tear down on overflow;
      also surface write rejections (see existing swallowed-write issue).
- [ ] **Session revocation / logout does not terminate active SSE streams** —
      after the connect-time `requirePrincipal`, the loop never re-validates
      the session (`streamEvents.ts:55-62`); and `signOut` closes
      `sse:${app.code}:...` where `app.code` comes from the logout request's
      `X-App-Code` header, while the subscriber's appCode came from the SSE
      `?app=` query (`:13`) — a mismatch misses the subscriber and the stream
      survives logout/password-change/token-rotation. Re-validate the session
      in the loop (or subscribe to an invalidation event), and key/close
      subscriptions by `userId + sessionId`, not appCode.

### Infra / Boot

- [ ] **Boot seed gate skips reference-data updates on `update`-deploys** —
      `seed` runs only `if (!adminApp)` (`app.ts:38-45`), but `seed.ts` is an
      idempotent desired-state upsert (permissions, menus, roles, configs,
      notification templates) explicitly "safe to run in production". The
      updater's update path runs migrations but *not* seed
      (`packages/updater/src/pipeline.ts:95-100`), so on a non-fresh deploy any
      newly added permission/menu/role/config never reaches the DB (mysterious
      403s / missing menus). Drop the gate and run the idempotent seed every
      boot (or on version change).
- [ ] **Body-size limit is bypassable via Content-Type spoofing** — the cap is
      chosen by sniffing the `Content-Type` header (`app.ts:143-149`): a 6 MB
      JSON payload reaches any JSON endpoint by sending `Content-Type:
      multipart/form-data` (Hono parses the body as JSON regardless of the
      declared type). Select the limit from the route, not the header; at
      minimum re-validate size when `c.req.json()` runs.
- [ ] **CORS dev branch reflects any origin with credentials; reachable via
      `NODE_ENV` misconfiguration** — when `CORS_ALLOWED_ORIGINS` is unset and
      `NODE_ENV !== "production"`, the server reflects the caller's `Origin`
      and allows credentials (`app.ts:106-108`): any site can issue
      authenticated credentialed requests. The sole gate is the exact string
      `"production"`; many deploy defaults leave `NODE_ENV` unset /
      `"development"` and silently run this in production. Fail closed
      (`origin: null`) when no allowlist is configured; require an explicit
      opt-in for dev-permissive behavior.
- [ ] **`serializeHTTPException` blind-spreads `cause` into the client
      response** — whatever a throw site puts in
      `new HTTPException(status, { cause })` is serialized verbatim
      (`shared/lib/http-error.ts:10-22`); a single site including internal
      context (Prisma meta, internal IDs, partial records) leaks it to the
      client. Allow-list public fields instead of spreading.
- [ ] **Updater tarball extraction has no path-traversal (tar-slip)
      mitigation** — `verifyTarball` only checks three marker filenames in
      `tar -tzf`; it does not reject absolute paths, `..` components, or
      escaping symlinks (`packages/updater/src/pipeline.ts:244-267,83-88`). A
      tarball with the markers *plus* traversal entries
      (`../../../.ssh/authorized_keys`, or overwriting
      `ecosystem.config.js`/`updater.mjs`) passes and is extracted verbatim,
      ending in automatic restart = code execution as the deploy user.
      Validate every entry's path before extraction; add
      `--no-same-owner --no-overwrite-dir`.

## Low Priority

### Self-Update / Deploy

- [ ] **Old JS chunks accumulate after self-update** — `tar -xzf` only
      adds/overwrites; it never deletes files absent from the tarball, so
      stale `.next/static/chunks/*.js` from every previous build pile up
      indefinitely in `apps/<name>/apps/<name>/.next/static/`
      (`packages/updater/src/pipeline.ts:83-88`). Fix: `rm -rf
      $DEPLOY_ROOT/apps` before extraction — the tarball contains the
      complete `apps/` tree, and nothing inside `apps/` needs to persist
      (`.env.production`, `updater.sock`, `node_modules/`, `prisma/` all
      live at the DEPLOY_ROOT root). Brief gap for static-asset requests
      during extraction is acceptable: apps serve from memory and
      `pm2 restart` follows shortly after.

### Auth & Session

- [ ] **Session tokens stored in plaintext (+ raw token embedded in SSE
      target)** [#6](https://github.com/lisiur/platform/issues/6) — looked up by exact match (`lib/session.ts:128`); a DB
      read leak yields live sessions. Unlike API tokens (SHA-256 hashed),
      sessions aren't. The raw token also lives in the event-bus subscriber
      target for the connection's lifetime
      (`routes/events/streamEvents.ts:14`). Hash at rest; subscribe by
      `sessionId`, not token.
- [ ] **No concurrent-session cap per user** [#7](https://github.com/lisiur/platform/issues/7) — `createSession` now cleans
      up the caller's own dead sessions before inserting
      (`lib/session.ts:72-85`), but there is still no cap on the number
      of *active* sessions; with no lockout, credential stuffing can flood
      a victim with sessions. Enforce a max active count (evict oldest).
- [ ] **No account lockout / failed-attempt tracking beyond the IP rate
      limiter** [#8](https://github.com/lisiur/platform/issues/8) — the only brute-force control is the in-memory `authLimiter`
      (`app.ts:110-125`). A distributed or slow attack under the per-IP
      limit proceeds unimpeded; the User model has no
      `failedLoginAttempts`/`lockedUntil`. Track per-identity failures and
      lock after a threshold.
- [ ] **CSRF defense is only `SameSite=Lax`** [#9](https://github.com/lisiur/platform/issues/9) — `session.ts:49`; no
      origin/CSRF-token check anywhere (`app.ts`). Any GET endpoint that
      mutates state would be CSRF-able, and Lax offers no defense if a
      same-site subdomain is compromised. Add a strict
      `Origin`/`Sec-Fetch-Site` check for unsafe methods.
- [ ] **WeChat app secret sent in the URL query string** [#10](https://github.com/lisiur/platform/issues/10) — `appid`/`secret`/
      `js_code` are all URL params (`lib/wechat.ts:22-26`); WeChat requires
      this, but the secret is liable to appear in outbound proxy/HTTP-tracing
      logs. Ensure no middleware logs this request's URL.
- [ ] **API token `lastUsedAt` updated on every authenticated request** [#31](https://github.com/lisiur/platform/issues/31) —
      `getApiTokenByBearer` runs `prisma.apiToken.update({ lastUsedAt })`
      per call (`lib/api-token.ts:57-59`); every bearer-token request
      triggers a DB write, adding write amplification and lock contention
      under token-based API load (read-on-every-write). The write is
      fire-and-forget (`.catch(() => null)`) so it can't fail the request,
      but the per-request write is wasteful. Throttle the update (e.g.
      only when the stored value is older than N seconds) or move it to a
      best-effort async background tick.

### Notifications

- [ ] **`listNotificationRecords` is not org/app scoped** [#12](https://github.com/lisiur/platform/issues/12) — gated only by
      the `notification-record::list` permission with no scope constraint
      (`services/notification-record.service.ts:50-131`); a holder in any
      scope lists every notification (incl. rendered subjects/bodies)
      across all orgs/apps. Restrict by the principal's effective scope or
      treat as platform-admin-only.

### Upload / Attachment

- [ ] **Magic-byte verification is shallow** [#13](https://github.com/lisiur/platform/issues/13) — several signatures are
      minimal (webp checks only RIFF + "WEBP", PDF only `%PDF`, GIF only
      `GIF8`) (`lib/mime.ts:22-46`); the SVG check is weaker still — a
      pure `<?xml`/`<svg` string prefix with no structural validation
      (`lib/mime.ts:38-41`); a polyglot (JPEG with trailing HTML)
      passes. Use a real format-aware library (e.g. `file-type`).
      Note: SVG script execution is mitigated at serve time via
      `Content-Security-Policy: default-src 'none'` + `nosniff`
      (`routes/attachment/getAttachment.ts:64,72-75`), so the shallow
      SVG check is not currently exploitable.
- [ ] **Dead auth check in `signFile`** [#14](https://github.com/lisiur/platform/issues/14) — `if (!getPrincipalUserId(principal))
      throw 401` (`routes/attachment/signAttachment.ts:32-34`) is unreachable
      because `getPrincipalUserId` always returns a non-empty string. Remove
      or replace with a real ownership check.

### Cache

- [ ] **Cache `getOrSet` is unused and not stampede-safe** [#15](https://github.com/lisiur/platform/issues/15) — the cache-aside
      helper exists (`lib/cache.ts:76`) but has no callers; concurrent misses
      each fetch independently. Either adopt it (with in-flight promise
      de-dup) or remove it.
- [ ] **Cache `get<T>()` is an unchecked cast** [#16](https://github.com/lisiur/platform/issues/16) — `set(key, unknown)`
      stores untyped and `get<T>()` blindly casts (`lib/cache.ts:43-51`). A
      wrong `T` at the read site compiles but returns garbage; keep
      read/write types aligned or add a typed wrapper.

### AI Agent

- [ ] **`GET /api/agent/config` and `loadAiAgentConfig` hit the DB uncached** —
      `loadAiAgentConfig` resolves the app's ai-agent config from the DB
      (`services/agent-config.service.ts:54`); the new `GET /api/agent/config`
      (`routes/agent/getConfig.ts`) calls it per request. The client caches the
      result at module scope (`hooks/use-agent-config.ts`), so a single chat
      session issues one request, but every new mount / app load re-hits the DB
      and `sendMessage` calls `loadAiAgentConfig` again on every turn. Add a
      short TTL cache (e.g. via `lib/cache.ts`) keyed by `appId` for the
      ai-agent config group, with invalidation on config upsert.

### Jobs / Queue

- [ ] **Job `priority` is informational only** [#17](https://github.com/lisiur/platform/issues/17) — stored and surfaced in the
      API but does not affect execution order (`p-queue` runs FIFO). Either
      wire priority into queue ordering or drop the field/docs claiming it.

### Schema & DB

- [ ] **Only a single baseline migration; schema drift relies on
      `db:push`** [#19](https://github.com/lisiur/platform/issues/19) — `prisma/migrations/` contains only
      `00000000000000_init/`. Later additions (Notification, ApiToken,
      RateLimitOverride, etc.) aren't captured as migrations, so prod/dev
      drift is invisible. Adopt `prisma migrate dev`/`migrate deploy` for
      schema changes.

### Auth & Session

- [ ] **Overly broad `catch` in admin `createUser` masks all failures as
      "User already exists"** — `.catch(async () => …)` handles every error
      from `createAuthUser` identically and re-queries by email
      (`user.service.ts:55-68`): a transient DB blip or a P2002 on a *different*
      constraint is misreported as a conflict (or a generic 500), and a
      network hiccup that did create the user is retried as a conflict. Narrow
      the catch to `err.code === "P2002"` on the email constraint; rethrow the
      rest.
- [ ] **API token with `scope: null` bypasses token-binding enforcement** —
      tokens created without an explicit scope store `scope: null`
      (`api-token.service.ts:69`), and `enforceTokenBinding` checks
      `if (token.scope && token.scope !== scope)`
      (`role-permission.service.ts:245`), so a null scope short-circuits the
      binding entirely. Harmless today (scope validation elsewhere still
      gates), but the binding layer provides no defense-in-depth. Default the
      stored scope to `SYSTEM_SCOPE`, or treat null as `SYSTEM_SCOPE` in the
      guard.

### Jobs / Queue

- [ ] **No jitter in retry backoff** — backoff is
      `RETRY_BASE * 2 ** (attempts-1)` capped at 5 min with no randomness
      (`shared/lib/queues/job-worker.ts:7-8,55-59`); a simultaneous failure
      burst (DB/SMTP outage) retries in lockstep and re-hammers the recovering
      dependency. Add full/decorrelated jitter.
- [ ] **Duplicate delivery side-effects on job retry** — side effects fire
      before the status row is persisted (`eventBus.publish`/`sendMail` before
      the `SENT` update: `notification.service.ts:176-187,209-228`); if the
      process dies in that window the row stays `PENDING` and the retried run
      re-publishes/re-sends. Persist an "attempted" state (or an idempotency
      key) before the side effect.
- [ ] **`JobExecutorContext.emit` swallows listener errors and can skip later
      listeners** — `void listener(data)` discards the handle but does not
      catch a throw; a synchronous throw aborts the `forEach` and silently
      breaks later listeners (e.g. job scheduling)
      (`shared/lib/queues/job-executor-context.ts:38-43`). Wrap each listener
      in try/catch (compare `packages/updater/src/state.ts:42-50`, which does
      it correctly).

### Upload / Attachment

- [ ] **`getAttachment` ignores HTTP `Range` (no 206 partial content)** — it
      always streams the full file with `200`/full `Content-Length`
      (`routes/attachment/getAttachment.ts:27-79`;
      `attachment.service.ts:199-212`); PDFs (an allowed type) can't seek by
      page and clients waste bandwidth. Parse `Range`, return `206` with
      `Content-Range`/`Accept-Ranges: bytes`, and pass `{start,end}` to
      `createReadStream`.
- [ ] **`Content-Disposition` carries no `filename`** — the header is bare
      `"inline"`/`"attachment"` with no filename (`getAttachment.ts:66`); the
      URL path is an opaque id with no extension, so browsers save
      extension-less files. Add a sanitized RFC-5987 `filename*` derived from
      the attachment id + mime extension (never raw user input).
- [ ] **Unsanitized `?app=` query is interpolated into the SSE routing key** —
      `c.req.query("app") ?? "*"` is placed raw into
      `sse:${appCode}:${userId}:${token}` and matched by `split(":")`
      (`streamEvents.ts:13-14`); `app=*` widens receipt and a value diverging
      from the server's app code defeats the logout-close. Validate against
      known application codes; reject values containing `:`/`*`.

### Access Control / Organization

- [ ] **`registerOrganization`/`activateOrganization` crash (500) for
      API-token principals** — both call `requirePrincipal` (accepts tokens)
      then unsafely cast to the user variant and read `principal.session.id`
      (`routes/organization/registerOrganization.ts:66-72`;
      `activateOrganization.ts:39-44`); for a token principal `.session` is
      undefined → `TypeError`, and in `registerOrganization` the org is
      created *before* the crash (orphaned org). Guard
      `principal.kind !== "user"` (or use `requireSession`).
- [ ] **`batchUpdateMembers` omits `organizationId` from the `updateMany`
      WHERE** — the final mutation is `where: { id: { in: memberIds } }` with
      no org boundary (`member.service.ts:151-154`); safe today only because
      preceding validation checked membership, but fragile to refactor. Add
      `organizationId` to the WHERE (defense-in-depth).

### AI Agent

- [ ] **Fire-and-forget title generation runs with no abort/budget** —
      `generateText` is launched with `.catch(...)` and no `abortSignal`
      (`sendMessage.ts:177-186`), so it keeps doing a full provider round-trip
      after the user disconnects / the main stream aborts. Thread the request
      signal (or `AbortSignal.any([clientSignal, shortTimeout])`).
- [ ] **OpenAPI spec is cached forever and fetched with no timeout/retry** —
      `getPlatformOpenApiSpec` caches in a module variable with no TTL and a
      bare `fetch(url)` (`openapi.service.ts:56,110-123`): the first agent
      request after boot blocks on it (500 if the service is still starting),
      and new operationIds added later won't resolve until restart. Add a
      fetch timeout, short retry, and TTL.
- [ ] **Raw upstream errors are logged server-side and may contain provider
      auth details** — `onError`, the title `.catch`, and the persistence
      catch all `console.error(err)` the raw object
      (`sendMessage.ts:183-185,216-223,260-268`); OpenAI-compatible providers
      sometimes echo key fragments/URLs in `APICallError.message`, landing
      them in log aggregators. (Client-facing output is masked in prod —
      good.) Redact `apiKey`/`Authorization`/known patterns before logging.

### Infra / Boot

- [ ] **Operation-log API exposes full stack traces** — every unhandled
      error's `Error.stack` + message is persisted (`shared/lib/logger.ts:73-75`)
      and returned by the operation-log API
      (`modules/audit/routes/operation-log/schema.ts:20-22`), readable by any
      `system/operation-log:list|:view` holder. The app error handler hides
      stacks from end users in prod, then re-exposes them here. Don't return
      `stack` from the API (store server-side only) or gate it behind a
      separate permission.
- [ ] **Internal-token (SSR/Agent) comparison is non-constant-time** —
      `token === process.env.SSR_API_TOKEN` / `=== AGENT_API_TOKEN`
      (`shared/lib/internal-request.ts:7-9`;
      `shared/middleware/operation-logger.ts:13-21`); `===` short-circuits on
      the first differing byte and possession bypasses rate limiting
      (`rate-limit.ts:30-32`). Use `crypto.timingSafeEqual` (after a length
      check).
- [ ] **`x-trace-id` response header is missing on error responses** —
      `trace-context` sets the header *after* `next()`
      (`shared/middleware/trace-context.ts:9-17`), so when a handler throws the
      header doesn't land on the `onError` response (the JSON-body `traceId`
      is the only fallback). Set the header before `next()` (idempotent).
- [ ] **Updater download has no maximum-size cap** — `download()` streams to
      disk with no byte ceiling, using `content-length` only for progress
      (`packages/updater/src/pipeline.ts:161-242`); a wrong/compromised
      `tarballUrl` (no checksum/signature today) can disk-exhaust the box
      mid-update. Abort + delete the partial file past an explicit ceiling.
- [ ] **`createSession` loads every session for the user** —
      `prisma.session.findMany({ where: { userId }})` has no `take`/`select`
      (`shared/lib/session.ts:88-101`); an attacker automating logins to
      accumulate thousands of rows triggers an unbounded load on every
      sign-in. Prune in the DB (`deleteMany` expired/revoked) or cap with
      `take`.
- [ ] **Rate-limit subject/IP depends on a trust-proxy spec that's easy to
      misconfigure** — with the default trust
      (`uniqueLocal,loopback,linkLocal`, `shared/lib/client-ip.ts:3`) behind a
      cloud LB every client shares one bucket (limit trivially exhausted or
      irrelevant); the natural fix (`trustProxy=all`) trusts attacker-supplied
      `X-Forwarded-For` and lets an attacker rotate buckets to bypass limiting
      — including the auth limiter. Validate/require the trust spec at boot;
      derive the subject from a more robust signal.

## No Dues

### Auth & Session

- [ ] **Sign-up TOCTOU race → unhandled P2002 → 500** [#21](https://github.com/lisiur/platform/issues/21) — `signUpWithEmail`
      does `findUnique` then `createUser` without catching the unique
      violation (`services/auth.service.ts:189-200`); concurrent same-email
      signups both pass the check and the loser throws
      `PrismaClientKnownRequestError (P2002)`, surfacing as a 500. Map
      `P2002` to `409 "User already exists"`.
      **Deferred:** real-world frequency is near-zero (two humans picking
      the same email within the ~100ms window doesn't happen organically),
      and the impact is just an ugly 500 for the loser — no data
      corruption, no security breach. The `findUnique` pre-check returns a
      clean 400 for the 99.99% case, and the DB unique constraint remains
      the source of truth. Note: the WeChat login path (`signInWithWechat`)
      already catches P2002 and retries (`auth.service.ts:439-452`). Revisit
      only if error-monitoring noise from collisions becomes problematic.
- [ ] **No email verification** [#22](https://github.com/lisiur/platform/issues/22) — `emailVerified` set false, never
      enforced; no verify endpoint in `routes/auth/`. Enforce ownership
      beyond uniqueness.
- [ ] **Account enumeration via sign-in timing** [#23](https://github.com/lisiur/platform/issues/23) — when the user is
      missing, the `||` short-circuits and `verifyPassword` is skipped
      (`services/auth.service.ts:81-116`); argon2 makes the existing-user
      branch tens of ms slower, exposing whether an account exists. Run a
      dummy `verifyPassword` on miss to equalize timing.

### Notifications

- [ ] **SMTP transporter rebuilt for every email** [#24](https://github.com/lisiur/platform/issues/24) — `createTransport` runs
      inside `sendSmtpEmail` per call (`services/notification/mailer.ts:57-68`);
      a single SMTP timeout marks the notification `failed` with no in-service
      retry (`notification.service.ts:231-237`). Cache one transporter per
      `channelId` and rely on the job worker's retry/backoff.
      **Deferred:** not a critical problem; the job worker already handles
      retries and SMTP setup cost is negligible at expected notification volume.

### Jobs / Queue

- [ ] **Job queue: no row-level claim / not multi-instance safe** [#26](https://github.com/lisiur/platform/issues/26) — the
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

- [ ] **Cache invalidation is coarse (whole-namespace)** [#30](https://github.com/lisiur/platform/issues/30) — channel/template
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

- [ ] **Boot-time side effects** [#27](https://github.com/lisiur/platform/issues/27) — `seed()` + `jobExecutor.start()` run at
      module boot (`src/app.ts:28-45`). Anti-pattern for
      serverless/standalone Next.js; risks cold-start races. Move to
      deploy/migration step.

### Rate Limit

- [ ] **Rate limit counters are in-memory / not multi-instance safe** [#28](https://github.com/lisiur/platform/issues/28) —
      each instance counts independently, so behind a load balancer the
      effective per-subject limit is ~`N × max`
      (`lib/rate-limit-store.ts`). Same single-process constraint as
      Jobs/Cache; an external store (Redis) or shared Postgres counter is
      needed before scaling horizontally.

### SSE / Events / Session

- [ ] **New SSE/event-bus/session issues share the single-process caveat**
      [#29](https://github.com/lisiur/platform/issues/29) — the SSE per-user connection cap, event-bus O(subscribers)
      publish, and plaintext in-process session store are all unfixable
      without an external broker/shared store; same horizontal-scaling
      blocker as Jobs/Cache/Rate-limit above.

### Auth & Session

- [ ] **WebAuthn challenge cache is in-process only — passkeys break under
      any horizontal scaling** — challenges live in a per-process LRU
      (`shared/states/cache.ts:12-13` → `shared/lib/cache.ts`); a challenge
      issued by instance A is unknown to instance B, so registration/login
      verification always fails `400 "Invalid challenge"` behind a load
      balancer. Unlike the soft-failing notification/rate-limit caches, the
      WebAuthn flow *requires* the challenge, so this is a functional
      regression (not merely a scaling caveat) the moment a second instance is
      added. Back the store with Redis or a TTL'd DB table, or use sticky
      sessions. Same single-process constraint as Jobs/Cache/Rate-limit above.

## Resolved

### Auth & Session

- [x] **`/auth/update-user` accepts API tokens with no scope check** [#11](https://github.com/lisiur/platform/issues/11)
      — the handler now gates on `principal.kind !== "user"` before acting
      (`routes/auth/updateUser.ts:27-29`), so a bearer API token can no
      longer rewrite the owner's profile.
- [x] **`resetPassword` skips the builtin-user guard (privilege escalation)**
      — `resetPassword` now calls `assertUserIsNotBuiltin(id)` before any
      password/session mutation (`modules/identity/user.service.ts:216`),
      mirroring `deleteUser` (`:304`). A `system/user:update` holder can no
      longer reset the platform super-admin's password.
- [x] **Admin user create/update assigns arbitrary `roleId`s with no scope
      validation (privilege escalation)** — `createUser` and `updateUser`
      now validate every `roleId` via `assertRoleIdsWithinScope(roleIds,
      SYSTEM_SCOPE)` (`modules/identity/user.service.ts`): it fetches each
      `Role`, rejects unknown ids (400), and asserts each role's scope
      (parsed from its code) equals `SYSTEM_SCOPE` (403). This closes the
      cross-tenant vector where a `system/user:create|:update` holder could
      grant `org:<anyId>/owner` and take over any organization, and aligns
      the upsert path with the existing `SYSTEM_SCOPE`-only delete filter.
      (Assigning a different system role the caller doesn't personally hold
      is intentionally out of scope — that's within the trust model of
      `system/user:update`.)

### Schema & DB

- [x] **`Verification` rows are never cleaned up** [#20](https://github.com/lisiur/platform/issues/20)
      — resolved on both fronts: `@@index([expiresAt])` is now present
      (`prisma/schema.prisma:80`) and the `verification-sweep` job handler
      deletes expired rows (`states/job-executor/handlers/verification-sweep.handler.ts`).

