import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { resolveClientIp } from "#lib/client-ip";
import { rateLimitRegistry } from "#lib/rate-limit-registry";
import { RateLimitStore } from "#lib/rate-limit-store";
import { getSessionFromHeaders } from "#lib/session";
import { getTrustSpecSync } from "#services/rate-limit.service";
import { eventBus } from "#states/event-bus";

export type RateLimiterOptions = {
  name: string;
  max: number;
  windowMs: number;
  store?: RateLimitStore;
  enabled?: boolean;
};

function getPeerIp(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

function getClientIp(c: Context): string {
  const peerIp = getPeerIp(c);
  const xff = c.req.header("x-forwarded-for");
  const xRealIp = c.req.header("x-real-ip");
  const trust = getTrustSpecSync();
  return resolveClientIp({ peerIp, xForwardedFor: xff, xRealIp, trust });
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { name, max, windowMs } = options;
  const enabled = options.enabled ?? process.env.RATE_LIMIT_ENABLED !== "false";
  const store = options.store ?? new RateLimitStore();

  rateLimitRegistry.registerLimiter({ name, max, windowMs, enabled, store });

  return createMiddleware(async (c, next) => {
    const entry = rateLimitRegistry.getLimiter(name);
    if (!entry?.enabled) {
      return next();
    }

    const session = await getSessionFromHeaders(c.req.raw.headers);
    const subject = session
      ? `user:${session.user.id}`
      : `ip:${getClientIp(c)}`;

    const policy = rateLimitRegistry.resolvePolicy(name, subject);
    if (policy.bypass) {
      return next();
    }

    const { count, resetAt } = store.hit(subject, policy.windowMs);
    const remaining = Math.max(0, policy.max - count);
    const resetSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

    c.header("X-RateLimit-Limit", String(policy.max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSeconds));

    if (count > policy.max) {
      if (count - 1 <= policy.max) {
        eventBus.publish({
          type: "rate_limit.updated",
          target: "sse:admin:*:*",
        });
      }
      c.header("Retry-After", String(resetSeconds));
      return c.json({ code: 429, message: "Too Many Requests" }, 429);
    }

    await next();
  });
}
