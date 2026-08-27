import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import type { Application } from "#modules/application/routes/application/schema";

// ---------------------------------------------------------------------------
// Per-code in-process cache for the Application row resolved from
// X-App-Code. Every SSR render of every app's root layout hits
// GET /api/applications/current (generateMetadata), so an uncached lookup
// turns bot traffic into constant DB-pool pressure (see the 2026-08-27
// incident). Design:
//   - TTL (60s) is the safety net for bypasses (direct prisma edits).
//   - Explicit invalidation on the canonical update paths (application
//     service) makes admin saves take effect immediately.
//   - Single-flight: concurrent misses for the same code share one query.
//   - Negative caching: non-existent codes (scanner probes) are cached too.
//   - Error backoff: a failed lookup is retried at most once per
//     ERROR_TTL_MS instead of hammering an exhausted pool.
// The cached value is shared by reference — callers must treat it as
// read-only.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;
const ERROR_TTL_MS = 1_000;

interface CacheEntry {
  app: Application | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Application | null>>();
// Generation per code, bumped on invalidation. A query that started before
// an invalidation must NOT repopulate the cache with its (stale) result.
const generations = new Map<string, number>();

export function invalidateAppCache(code: string): void {
  cache.delete(code);
  generations.set(code, (generations.get(code) ?? 0) + 1);
  // In-flight queries are not cancelled: they complete and self-clean, but
  // their result is discarded by the generation check in findCurrentApp.
}

/** Test-only: wipe all cache state between test cases. */
export function __resetAppCacheForTests(): void {
  cache.clear();
  inFlight.clear();
  generations.clear();
}

async function loadCurrentApp(code: string): Promise<Application | null> {
  return prisma.application.findFirst({ where: { code } });
}

async function findCurrentApp(c: Context): Promise<Application | null> {
  const code = c.req.header("X-App-Code");
  if (!code) return null;

  const now = Date.now();
  const hit = cache.get(code);
  if (hit && hit.expiresAt > now) return hit.app;

  let pending = inFlight.get(code);
  if (!pending) {
    pending = loadCurrentApp(code).finally(() => {
      inFlight.delete(code);
    });
    inFlight.set(code, pending);
  }

  const generation = generations.get(code) ?? 0;
  try {
    const app = await pending;
    // Only populate if no invalidation happened while the query was in
    // flight — otherwise the result is stale and must be dropped.
    if ((generations.get(code) ?? 0) === generation) {
      cache.set(code, { app, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return app;
  } catch (err) {
    // Back off on failure (typically pool exhaustion): cache the miss for a
    // short window so a failing DB is probed at most once per second
    // instead of once per request.
    if ((generations.get(code) ?? 0) === generation) {
      cache.set(code, { app: null, expiresAt: Date.now() + ERROR_TTL_MS });
    }
    throw err;
  }
}

export async function tryCurrentApp(c: Context): Promise<Application | null> {
  return findCurrentApp(c);
}

export async function requireCurrentApp(c: Context): Promise<Application> {
  const code = c.req.header("X-App-Code");
  if (!code) {
    throw new HTTPException(400, { message: "Missing X-App-Code header" });
  }
  const currentApp = await tryCurrentApp(c);
  if (!currentApp) {
    throw new HTTPException(404, {
      message: `Application not found: ${code}`,
    });
  }
  return currentApp;
}

export async function tryAppId(c: Context): Promise<string | null> {
  return (await findCurrentApp(c))?.id ?? null;
}

export async function requireAppId(c: Context): Promise<string> {
  return (await requireCurrentApp(c)).id;
}
